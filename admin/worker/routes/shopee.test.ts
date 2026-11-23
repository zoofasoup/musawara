import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { makeDb } from "../testkit/d1.ts";
import shopee from "./shopee.ts";
import { authUrl, connectShop, jakartaStart, pickOrder, shopeeCfg, signRequest, syncShop } from "../lib/shopee.ts";

const SECRET = "test-secret";
const CFG = { partnerId: 1001, partnerKey: "partner-key", host: "https://shopee.test" };
const NOW = 1_800_000_000;
const hmac = (msg: string) => createHmac("sha256", CFG.partnerKey).update(msg).digest("hex");

// What Shopee returns for an order, buyer details included. None of the buyer fields may be stored.
const rawOrder = (sn: string, status: string, create: number, total: number) => ({
  order_sn: sn, order_status: status, create_time: create, update_time: create + 60, total_amount: total, currency: "IDR",
  buyer_username: "budi_buyer", buyer_user_id: 777, message_to_seller: "kirim pagi",
  recipient_address: { name: "Budi Santoso", phone: "081234567890", full_address: "Jl. Melati 5" },
  item_list: [{ item_id: 11, model_id: 1, item_name: "NurAlive Drops", model_quantity_purchased: 2, model_discounted_price: total / 2 }],
});

function fakeShopee(orders: any[], calls: string[] = []) {
  return (async (url: string) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (u.pathname.endsWith("/auth/token/get") || u.pathname.endsWith("/auth/access_token/get"))
      return ok({ error: "", message: "", access_token: "AT-" + calls.length, refresh_token: "RT-" + calls.length, expire_in: 14400 });
    if (u.pathname.endsWith("/order/get_order_list")) return ok({ error: "", response: { more: false, order_list: orders.map((o) => ({ order_sn: o.order_sn })) } });
    if (u.pathname.endsWith("/order/get_order_detail")) return ok({ error: "", response: { order_list: orders } });
    return ok({ error: "error_not_found", message: "no" });
  }) as unknown as typeof fetch;
}

async function setup() {
  const DB = makeDb();
  await DB.exec(`
    INSERT INTO clients (id,name,slug,share_token,share_enabled) VALUES (1,'Alpha','alpha','t1',1),(2,'Beta','beta','t2',1);
    INSERT INTO users (id,email,password_hash,name,role,client_id,staff_role,client_role) VALUES (1,'a@x','h','Admin','admin',NULL,'owner',NULL),(2,'c@x','h','Client','client',1,NULL,'approver');
  `);
  const app = new Hono<any>();
  app.route("/api/shopee", shopee);
  const env: any = { DB, JWT_SECRET: SECRET, SHOPEE_PARTNER_ID: "1001", SHOPEE_PARTNER_KEY: "partner-key", SHOPEE_API_HOST: "https://shopee.test" };
  const cookie = async (id: number, role: string, client_id: number | null) =>
    `ma_session=${await sign({ sub: id, email: "e", name: "n", role, client_id, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
  const call = (method: string, path: string, ck?: string, body?: unknown, e: any = env) =>
    app.request(path, { method, headers: { ...(ck ? { cookie: ck } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }, e);
  return { DB, env, call, cookie };
}

test("signing follows Shopee's scheme: public calls sign id+path+ts, shop calls add token and shop id", async () => {
  assert.equal(await signRequest(CFG, "/api/v2/shop/auth_partner", NOW), hmac(`1001/api/v2/shop/auth_partner${NOW}`));
  assert.equal(await signRequest(CFG, "/api/v2/order/get_order_list", NOW, { accessToken: "AT", shopId: 55 }), hmac(`1001/api/v2/order/get_order_list${NOW}AT55`));
  const u = new URL(await authUrl(CFG, "https://app.example/cb?state=s", NOW));
  assert.equal(u.origin + u.pathname, "https://shopee.test/api/v2/shop/auth_partner");
  assert.equal(u.searchParams.get("sign"), hmac(`1001/api/v2/shop/auth_partner${NOW}`));
  assert.equal(u.searchParams.get("redirect"), "https://app.example/cb?state=s");
});

test("shopeeCfg is null until both secrets are set", () => {
  assert.equal(shopeeCfg({}), null);
  assert.equal(shopeeCfg({ SHOPEE_PARTNER_ID: "1001" }), null);
  assert.deepEqual(shopeeCfg({ SHOPEE_PARTNER_ID: "1001", SHOPEE_PARTNER_KEY: "k" }), { partnerId: 1001, partnerKey: "k", host: "https://partner.shopeemobile.com" });
});

test("pickOrder keeps only the allow-listed fields and drops every buyer detail", () => {
  const o = pickOrder(rawOrder("A1", "COMPLETED", NOW, 150000))!;
  assert.deepEqual(Object.keys(o).sort(), ["created_ts", "currency", "items", "order_sn", "status", "total_amount", "updated_ts"]);
  assert.deepEqual(o.items, [{ item_id: 11, model_id: 1, item_name: "NurAlive Drops", quantity: 2, unit_price: 75000 }]);
  assert.equal(pickOrder({ order_status: "X" }), null);
});

test("sync stores orders, never buyer data, and a second run updates instead of duplicating", async () => {
  const { DB, env } = await setup();
  const orders = [rawOrder("A1", "READY_TO_SHIP", NOW - 3600, 150000), rawOrder("A2", "COMPLETED", NOW - 7200, 90000)];
  await connectShop(env, CFG, 1, "CODE", 55, fakeShopee(orders), NOW - 20 * 86400);
  const first = await syncShop(env, CFG, 1, fakeShopee(orders), NOW);
  assert.equal(first.orders, 2);
  const again = await syncShop(env, CFG, 1, fakeShopee([rawOrder("A1", "COMPLETED", NOW - 3600, 150000)]), NOW + 10);
  assert.equal(again.orders, 1);
  const rows = (await DB.prepare(`SELECT order_sn,status FROM shopee_orders ORDER BY order_sn`).all<any>()).results.map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ order_sn: "A1", status: "COMPLETED" }, { order_sn: "A2", status: "COMPLETED" }]);
  assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM shopee_order_items`).first<any>()).n, 2);
  // Nothing buyer-related anywhere in the three Shopee tables (tokens are encrypted, so they are excluded from the text scan).
  const dump = JSON.stringify([
    (await DB.prepare(`SELECT * FROM shopee_orders`).all()).results,
    (await DB.prepare(`SELECT * FROM shopee_order_items`).all()).results,
  ]);
  for (const secret of ["budi", "Budi", "081234567890", "Melati", "kirim pagi", "777"]) assert.ok(!dump.includes(secret), `${secret} must not be stored`);
});

test("tokens are encrypted at rest and refreshed when about to expire", async () => {
  const { DB, env } = await setup();
  const calls: string[] = [];
  await connectShop(env, CFG, 1, "CODE", 55, fakeShopee([], calls), NOW);
  const row = await DB.prepare(`SELECT * FROM shopee_shops WHERE client_id=1`).first<any>();
  assert.ok(!row.access_token_enc.includes("AT-") && !row.refresh_token_enc.includes("RT-"));
  await syncShop(env, CFG, 1, fakeShopee([], calls), NOW + 20_000); // access token (4h) has expired
  assert.ok(calls.some((p) => p.endsWith("/auth/access_token/get")), "refresh call expected");
  assert.equal((await DB.prepare(`SELECT last_error FROM shopee_shops WHERE client_id=1`).first<any>()).last_error, null);
});

test("an expired refresh token asks for re-authorisation and records the error", async () => {
  const { DB, env } = await setup();
  await connectShop(env, CFG, 1, "CODE", 55, fakeShopee([]), NOW);
  await assert.rejects(syncShop(env, CFG, 1, fakeShopee([]), NOW + 31 * 86400), /reauthorize/);
  assert.match((await DB.prepare(`SELECT last_error FROM shopee_shops WHERE client_id=1`).first<any>()).last_error, /reauthorize/);
  await assert.rejects(syncShop(env, CFG, 2, fakeShopee([]), NOW), /not_connected/);
});

test("summary counts sales by Jakarta day, skips cancelled and unpaid, and ranks products", async () => {
  const { DB, env } = await setup();
  const d1 = jakartaStart("2026-11-10") + 3600, d2 = jakartaStart("2026-11-11") + 3600;
  const orders = [rawOrder("S1", "COMPLETED", d1, 100000), rawOrder("S2", "CANCELLED", d1, 50000), rawOrder("S3", "SHIPPED", d2, 200000), rawOrder("S4", "UNPAID", d2, 70000)];
  await connectShop(env, CFG, 1, "CODE", 55, fakeShopee(orders), jakartaStart("2026-11-09"));
  await syncShop(env, CFG, 1, fakeShopee(orders), jakartaStart("2026-11-12"));
  const { salesSummary } = await import("../lib/shopee.ts");
  const s = await salesSummary(DB, 1, "2026-11-10", "2026-11-11");
  assert.deepEqual(s.totals, { orders: 2, units: 4, revenue: 300000, avg_order: 150000 });
  assert.deepEqual(s.daily.map((d) => [d.day, d.orders, d.revenue]), [["2026-11-10", 1, 100000], ["2026-11-11", 1, 200000]]);
  assert.equal(s.top_products[0].units, 4);
  assert.deepEqual(Object.fromEntries(s.statuses.map((x) => [x.status, x.orders])), { COMPLETED: 1, CANCELLED: 1, SHIPPED: 1, UNPAID: 1 });
  assert.equal((await salesSummary(DB, 2, "2026-11-10", "2026-11-11")).totals.orders, 0); // other tenant sees nothing
});

test("routes are admin only, and report when Shopee is not configured", async () => {
  const { call, cookie, env } = await setup();
  const admin = await cookie(1, "admin", null), client = await cookie(2, "client", 1);
  assert.equal((await call("GET", "/api/shopee/status?client_id=1")).status, 401);
  for (const [m, p] of [["GET", "/api/shopee/status?client_id=1"], ["POST", "/api/shopee/auth-url"], ["POST", "/api/shopee/sync"], ["GET", "/api/shopee/summary?client_id=1&from=2026-01-01&to=2026-01-02"], ["DELETE", "/api/shopee/connection?client_id=1"], ["GET", "/api/shopee/callback?code=c&shop_id=1&state=s"]])
    assert.equal((await call(m, p, client, m === "POST" ? { client_id: 1 } : undefined)).status, 403, `${m} ${p}`);
  const bare = { DB: env.DB, JWT_SECRET: SECRET };
  assert.equal((await call("POST", "/api/shopee/auth-url", admin, { client_id: 1 }, bare)).status, 503);
  const st = await (await call("GET", "/api/shopee/status?client_id=1", admin, undefined, bare)).json() as any;
  assert.deepEqual([st.configured, st.connected], [false, false]);
});

test("auth-url carries a signed state, and the callback connects only with a valid one", async () => {
  const { DB, call, cookie } = await setup();
  const admin = await cookie(1, "admin", null);
  assert.equal((await call("POST", "/api/shopee/auth-url", admin, { client_id: 99 })).status, 404);
  const { url } = await (await call("POST", "/api/shopee/auth-url", admin, { client_id: 1 })).json() as any;
  const redirect = new URL(new URL(url).searchParams.get("redirect")!);
  assert.equal(redirect.pathname, "/api/shopee/callback");
  const state = redirect.searchParams.get("state")!;

  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeShopee([]);
  try {
    const bad = await call("GET", "/api/shopee/callback?code=C&shop_id=55&state=forged", admin);
    assert.equal(bad.headers.get("location"), "/shopee?shopee=expired");
    assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM shopee_shops`).first<any>()).n, 0);
    const noAdmin = await call("GET", `/api/shopee/callback?code=C&shop_id=55&state=${state}`);
    assert.equal(noAdmin.status, 401);
    const ok = await call("GET", `/api/shopee/callback?code=C&shop_id=55&state=${state}`, admin);
    assert.equal(ok.headers.get("location"), "/c/1/shopee?shopee=connected");
    assert.equal((await DB.prepare(`SELECT shop_id FROM shopee_shops WHERE client_id=1`).first<any>()).shop_id, 55);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("disconnect deletes the shop, its orders and items", async () => {
  const { DB, env, call, cookie } = await setup();
  await connectShop(env, CFG, 1, "CODE", 55, fakeShopee([]), NOW - 86400);
  await syncShop(env, CFG, 1, fakeShopee([rawOrder("A1", "COMPLETED", NOW - 100, 1000)]), NOW);
  const admin = await cookie(1, "admin", null);
  assert.equal((await call("DELETE", "/api/shopee/connection?client_id=1", admin)).status, 200);
  for (const t of ["shopee_shops", "shopee_orders", "shopee_order_items"]) assert.equal((await DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<any>()).n, 0, t);
});

test("summary validates its dates", async () => {
  const { call, cookie } = await setup();
  const admin = await cookie(1, "admin", null);
  assert.equal((await call("GET", "/api/shopee/summary?client_id=1&from=2026-11-12&to=2026-11-10", admin)).status, 400);
  assert.equal((await call("GET", "/api/shopee/summary?client_id=1&from=nope&to=2026-11-10", admin)).status, 400);
});
