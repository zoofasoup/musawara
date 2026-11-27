import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { sessionCookie } from "../testkit/session.ts";
import { app } from "../index.ts";
import { jubelioCfg, pickOrder, syncJubelio } from "../lib/jubelio.ts";
import { clientTrend, offlineSales } from "../lib/metrics.ts";

const TEAM = "https://app.musawara.id";
const CFG = { email: "api@x.test", password: "pw", clientId: 2, host: "https://jubelio.test" };
const order = (id: number, at: string, channel: string, total: string, extra: Record<string, unknown> = {}) => ({
  salesorder_id: id, salesorder_no: `SO-${id}`, transaction_date: at, channel_name: channel, store_name: "Toko", grand_total: total, is_paid: true, internal_status: "COMPLETED",
  customer_name: "Budi Santoso", shipping_full_name: "Budi", shipping_full_address: "Jl. Melati 5", customer_phone: "0812", note: "kirim pagi", ...extra,
});
function fakeJubelio(orders: any[], seen: string[] = [], status = 200, completed: any[] = []) {
  return (async (url: string, init: any) => {
    const u = new URL(url);
    if (u.pathname === "/login") { seen.push("login"); return Response.json(JSON.parse(init.body).password === "pw" ? { token: "T1" } : {}, { status: 200 }); }
    assert.equal(init.headers.authorization, "T1", "the token goes in as is");
    if (u.pathname === "/sales/orders/completed/") {
      const page = Number(u.searchParams.get("page")), size = Number(u.searchParams.get("pageSize"));
      return Response.json({ data: completed.slice((page - 1) * size, page * size), totalCount: completed.length });
    }
    assert.equal(u.searchParams.get("sort_by"), "transaction_date");
    seen.push(u.searchParams.get("last_modified_since") ?? `all from ${u.searchParams.get("transaction_date_from")}`);
    if (status !== 200) return new Response("no", { status });
    const page = Number(u.searchParams.get("page"));
    return Response.json({ data: orders.slice((page - 1) * 200, page * 200), totalCount: orders.length });
  }) as unknown as typeof fetch;
}

test("only the allow-listed fields of an order are kept, on the Jakarta day, and cancellations are marked", () => {
  const row = pickOrder(order(1, "2026-09-30T18:30:00Z", "SHOPEE", "140000"))!;
  assert.deepEqual(row, { id: 1, orderNo: "SO-1", day: "2026-10-01", channel: "SHOPEE", store: "Toko", total: 140000, status: "COMPLETED", canceled: 0, paid: 1, modified: null });
  assert.equal(JSON.stringify(row).includes("Budi"), false);
  assert.equal(pickOrder(order(2, "2026-10-01T00:00:00Z", "SHOPEE", "1", { is_canceled: true }))!.canceled, 1);
  assert.equal(pickOrder({ salesorder_id: 3 }), null);
  assert.equal(jubelioCfg({ JUBELIO_EMAIL: "a", JUBELIO_PASSWORD: "b" }), null, "needs the client id too");
});

test("sync reads all pages, updates instead of duplicating, and moves its position only on success", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (2,'NurAlive','n')").run();
  const many = Array.from({ length: 250 }, (_, i) => order(i + 1, "2026-10-05T03:00:00Z", i % 2 ? "SHOPEE" : "INTERNAL", "1000"));
  const seen: string[] = [];
  const now = Date.parse("2026-11-25T10:00:00Z");
  assert.equal((await syncJubelio({ DB } as any, CFG, fakeJubelio(many, seen), now)).orders, 250);
  assert.equal(seen[1], "all from 2026-01-01T00:00:00.000Z", "the first run reads by order date from the start of the year");
  await syncJubelio({ DB } as any, CFG, fakeJubelio([order(1, "2026-10-05T03:00:00Z", "SHOPEE", "5000", { is_canceled: true })], seen), now + 3600_000);
  assert.equal(seen.at(-1), "2026-11-25T09:00:00.000Z", "then from the last run, with an hour of overlap");
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM jubelio_orders").first<any>())!.n, 250);
  await assert.rejects(syncJubelio({ DB } as any, CFG, fakeJubelio([], [], 429), now + 7200_000), /rate limiting/);
  const state = await DB.prepare("SELECT synced_to, last_error FROM jubelio_sync").first<any>();
  assert.equal(state.synced_to, "2026-11-25T11:00:00.000Z", "a failed run keeps the old position");
  assert.match(state.last_error, /rate limiting/);
  await assert.rejects(syncJubelio({ DB } as any, { ...CFG, password: "wrong" }, fakeJubelio([]), now), /login failed/);
});

test("the report gives orders per channel per month next to ad spend, only to people who may see that client", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Musafar','m'),(2,'NurAlive','n')").run();
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES (1,'o@x.test','h','Owner','admin','owner'),(2,'c@x.test','h','Crm','admin','crm'),(3,'a@x.test','h','Content','admin','content')").run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1),(3,2)").run();
  await syncJubelio({ DB } as any, CFG, fakeJubelio([
    order(1, "2026-10-05T03:00:00Z", "SHOPEE", "100000"), order(2, "2026-10-06T03:00:00Z", "INTERNAL", "150000"),
    order(3, "2026-10-07T03:00:00Z", "SHOPEE", "90000", { is_canceled: true }), order(4, "2026-11-01T03:00:00Z", "SHOPEE", "200000"),
  ]));
  await DB.prepare("INSERT INTO spend_entries (client_id, source, category, date, amount) VALUES (2,'shopee','ads','2026-10-15',50000)").run();
  const env: any = { DB, JWT_SECRET: "test-secret-test-secret-test-secret-00", JUBELIO_EMAIL: "a", JUBELIO_PASSWORD: "b", JUBELIO_CLIENT_ID: "2" };
  const get = async (uid: number, path: string) => app.request(`${TEAM}/api/jubelio${path}`, { headers: { cookie: await sessionCookie(env, uid, TEAM) } }, env);
  const r: any = await (await get(1, "/report?client_id=2")).json();
  assert.equal(r.connected, true);
  assert.deepEqual(r.channels, ["INTERNAL", "SHOPEE"]);
  const oct = r.months.find((m: any) => m.month === "2026-10");
  assert.deepEqual([oct.orders, oct.value, oct.canceled, oct.spend_total, oct.channels.SHOPEE.orders], [2, 250000, 1, 50000, 1]);
  assert.deepEqual(r.months.map((m: any) => m.month), ["2026-11", "2026-10"]);
  assert.equal(((await (await get(1, "/status?client_id=1")).json()) as any).connected, false, "Jubelio belongs to one brand");
  assert.equal((await get(2, "/report?client_id=2")).status, 403, "not their client");
  assert.equal((await get(3, "/report?client_id=2")).status, 403, "no sales feature");
});

test("the Overview counts a Jubelio brand from paid orders only, and leaves other brands on their uploaded sales", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Musafar','m'),(2,'NurAlive','n')").run();
  await DB.prepare("INSERT INTO sales (client_id,sale_key,sale_date,value) VALUES (1,'a','2026-10-05',30000000), (2,'b','2026-10-05',150000)").run();
  const env: any = { DB };
  assert.deepEqual(await offlineSales(env, 2, "2026-10-01", "2026-10-31"), { purchases: 1, purchase_value: 150000, purchases_sent: 0 }, "before Jubelio has orders, uploads count");
  await syncJubelio({ DB } as any, CFG, fakeJubelio([
    order(1, "2026-10-05T03:00:00Z", "SHOPEE", "100000"), order(2, "2026-10-06T03:00:00Z", "INTERNAL", "150000"),
    order(3, "2026-10-07T03:00:00Z", "SHOPEE", "90000", { is_canceled: true }), order(4, "2026-10-08T03:00:00Z", "INTERNAL", "70000", { is_paid: false, internal_status: "PENDING" }),
  ]));
  assert.deepEqual(await offlineSales(env, 2, "2026-10-01", "2026-10-31"), { purchases: 2, purchase_value: 250000, purchases_sent: 0 }, "cancelled, unpaid and the uploaded duplicate are not counted");
  assert.equal((await offlineSales(env, 1, "2026-10-01", "2026-10-31")).purchase_value, 30000000);
  const trend = await clientTrend(env, 2, "2026-10-01", "2026-10-31");
  assert.deepEqual(trend.days.map((d: any) => [d.date, d.purchases]), [["2026-10-05", 1], ["2026-10-06", 1]]);
});

test("orders that only the completed list still has are added, without overwriting what the main list said", async () => {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (2,'NurAlive','n')").run();
  const main = [order(1, "2026-10-05T03:00:00Z", "SHOPEE", "1000")];
  const completed = [order(1, "2026-10-05T03:00:00Z", "SHOPEE", "999999", { store_name: null }), order(2, "2026-08-10T03:00:00Z", "SHOPEE", "2000")];
  const run = () => syncJubelio({ DB } as any, CFG, fakeJubelio(main, [], 200, completed), Date.parse("2026-11-27T04:00:00Z"));
  await run();
  await run();
  const rows = (await DB.prepare("SELECT salesorder_id id, day, total, store FROM jubelio_orders ORDER BY 1").all<any>()).results;
  assert.deepEqual(rows.map((r: any) => ({ ...r })), [{ id: 1, day: "2026-10-05", total: 1000, store: "Toko" }, { id: 2, day: "2026-08-10", total: 2000, store: "Toko" }]);
});
