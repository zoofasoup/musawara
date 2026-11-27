// Overview per platform: ad spend next to sales per sales channel, and one sync button that also reads Jubelio.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";
import { adRows, channelRows } from "../lib/platforms.ts";

const HOST = "https://app.musawara.id";

test("ad spend is listed per ad platform and sales per place of order, never mixed in one row", () => {
  const spend = [{ source: "meta", amount: 1000 }, { source: "tiktok", amount: 40 }, { source: "tokopedia", amount: 10 }];
  assert.deepEqual(adRows(spend, 4), [
    { key: "meta", name: "Meta Ads", spend: 1000, leads: 4 },
    { key: "shopee", name: "Shopee Ads", spend: 0, leads: null },
    { key: "tiktok", name: "TikTok / Tokopedia Ads", spend: 50, leads: null },
  ]);
  assert.deepEqual(adRows([...spend, { source: "other", amount: 5 }], 0).at(-1), { key: "other", name: "Other ads", spend: 5, leads: null });
  assert.deepEqual(
    channelRows([{ source: "Manual (internal)", orders: 2, value: 300 }, { source: "Tokopedia", orders: 1, value: 20 }, { source: "TikTok / Tokopedia Shop", orders: 1, value: 80 }, { source: "Shopee", orders: 3, value: 500 }]),
    [{ name: "Shopee", orders: 3, sales: 500 }, { name: "Manual (internal)", orders: 2, sales: 300 }, { name: "TikTok / Tokopedia", orders: 2, sales: 100 }],
  );
});

async function setup(env: Record<string, string> = {}) {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'A','a')").run();
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES (1,'o@x.test','h','O','admin','owner')").run();
  const full: any = { DB, JWT_SECRET: "test-secret", ...env };
  const jobs: Promise<unknown>[] = [];
  const call = async (method: string, path: string) =>
    app.request(HOST + path, { method, headers: { "content-type": "application/json", cookie: await sessionCookie(full, 1, HOST) }, body: method === "POST" ? "{}" : undefined }, full, { waitUntil: (p: Promise<unknown>) => jobs.push(p), passThroughOnException() {} } as any);
  return { DB, call, jobs };
}

test("the platforms route counts paid orders and ad spend (not fees) inside the range", async () => {
  const { DB, call } = await setup();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'shopee','ads','2026-11-02',100),(1,'shopee','ads','2026-10-30',999),(1,'shopee','fee','2026-11-02',77)").run();
  await DB.prepare(
    `INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES
     (1,1,'a','2026-11-03','SHOPEE',400,0,1),(1,2,'b','2026-11-03','SHOPEE',700,1,0),(1,3,'c','2026-10-01','SHOPEE',5,0,1)`
  ).run();
  const res = await call("GET", "/api/clients/1/platforms?from=2026-11-01&to=2026-11-30");
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.deepEqual(body.ads.map((a: any) => [a.key, a.spend]), [["meta", 0], ["shopee", 100], ["tiktok", 0]]);
  assert.deepEqual(body.channels, [{ name: "Shopee", orders: 1, sales: 400 }]);
});

test("Sync now also reads Jubelio for the brand it belongs to", async () => {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (u: any) => {
    asked.push(String(u));
    return String(u).endsWith("/login") ? Response.json({ token: "t" }) : Response.json({ data: [], totalCount: 0 });
  }) as typeof fetch;
  try {
    const { call, jobs } = await setup({ JUBELIO_EMAIL: "a@x.test", JUBELIO_PASSWORD: "p", JUBELIO_CLIENT_ID: "1", JUBELIO_API_HOST: "https://jubelio.test" });
    const res = await call("POST", "/api/admin/clients/1/sync");
    assert.equal(res.status, 202);
    assert.equal(((await res.json()) as any).orders, true);
    await Promise.all(jobs);
    assert.ok(asked.some((u) => u.startsWith("https://jubelio.test/sales/")));
  } finally {
    globalThis.fetch = real;
  }
});

test("each platform is shown month by month with its own results and its shop orders", async () => {
  const { DB, call } = await setup();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'shopee','ads','2026-10-31',100),(1,'shopee','ads','2026-11-27',200)").run();
  await DB.prepare("INSERT INTO ad_results (client_id,source,date,revenue,orders) VALUES (1,'shopee','2026-11-27',500,4)").run();
  await DB.prepare("INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES (1,1,'a','2026-11-03','SHOPEE',400,0,1),(1,2,'b','2026-11-03','INTERNAL',9,0,1)").run();
  const body: any = await (await call("GET", "/api/clients/1/platforms?from=2026-10-01&to=2026-11-30")).json();
  assert.deepEqual(body.detail.shopee, [
    { month: "2026-10", spend: 100, result: 0, adOrders: 0, shopOrders: 0, shopSales: 0, closings: 0, closingValue: 0 },
    { month: "2026-11", spend: 200, result: 500, adOrders: 4, shopOrders: 1, shopSales: 400, closings: 0, closingValue: 0 },
  ]);
  assert.deepEqual(body.detail.meta, []);
  assert.deepEqual(body.detail.tiktok, []);
});

test("CS closings from Meta are listed on the Meta tab and never added to a Jubelio brand's sales", async () => {
  const { DB, call } = await setup();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'shopee','ads','2026-11-02',100),(1,'shopee','fee','2026-11-02',77)").run();
  await DB.prepare("INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES (1,1,'a','2026-11-03','SHOPEE',400,0,1)").run();
  await DB.prepare(
    `INSERT INTO sales (client_id,sale_key,sale_date,value,source,pay_status) VALUES
     (1,'a','2026-11-03',150,'Instagram',NULL),(1,'b','2026-11-04',50,'Web IG',NULL),(1,'c','2026-11-05',9,NULL,NULL),(1,'e','2026-11-05',9,'Instagram Organik',NULL),(1,'f','2026-11-05',9,'Ads TikTok',NULL),(1,'d','2026-11-05',9,'Facebook','cancelled')`
  ).run();
  const range = "from=2026-11-01&to=2026-11-30";
  const platforms: any = await (await call("GET", `/api/clients/1/platforms?${range}`)).json();
  assert.deepEqual(platforms.detail.meta, [{ month: "2026-11", spend: 0, result: 0, adOrders: 0, shopOrders: 0, shopSales: 0, closings: 2, closingValue: 200 }]);
  const { current }: any = await (await call("GET", `/api/clients/1/summary?${range}`)).json();
  assert.equal(current.purchases, 1);
  assert.equal(current.purchase_value, 400);
  assert.equal(current.spend, 0, "Spend stays Meta only");
  assert.equal(current.ad_spend, 100, "fees are not ads");
  assert.equal(current.roas, 4);
  assert.equal(current.cpa, 100);
});
