// Overview per platform: ad spend next to sales per sales channel, and one sync button that also reads Jubelio.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";
import { spreadOverDays } from "../lib/spread.ts";

const HOST = "https://app.musawara.id";

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

const plain = (rows: any[]) => rows.map((r) => ({ ...r }));

test("a spread total adds up exactly, in whole numbers", () => {
  const days = spreadOverDays({ amount: 100, revenue: 10, orders: 2 }, "2026-11-01", "2026-11-03");
  assert.deepEqual(days.map((d) => d.amount), [33, 34, 33]);
  assert.equal(days.reduce((n, d) => n + d.revenue!, 0), 10);
  assert.equal(days.reduce((n, d) => n + d.orders!, 0), 2);
  assert.ok(days.every((d) => Number.isInteger(d.orders)));
});

test("ad spend and shop orders are listed per platform inside the range; fees, cancelled orders and other days are left out", async () => {
  const { DB, call } = await setup();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'shopee','ads','2026-11-02',100),(1,'tokopedia','ads','2026-11-02',5),(1,'shopee','ads','2026-10-30',999),(1,'shopee','fee','2026-11-02',77)").run();
  await DB.prepare("INSERT INTO ad_results (client_id,source,date,revenue,orders) VALUES (1,'shopee','2026-11-02',500,4)").run();
  await DB.prepare(
    `INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES
     (1,1,'a','2026-11-03','SHOPEE',400,0,1),(1,2,'b','2026-11-03','SHOPEE',700,1,0),(1,3,'c','2026-10-01','SHOPEE',5,0,1),(1,4,'d','2026-11-03','INTERNAL',9,0,1)`
  ).run();
  const res = await call("GET", "/api/clients/1/platforms?from=2026-11-01&to=2026-11-30");
  assert.equal(res.status, 200);
  const body: any = await res.json();
  assert.equal(body.bucket, "day");
  assert.deepEqual(plain(body.ads).sort((a, b) => a.platform.localeCompare(b.platform)), [
    { date: "2026-11-02", platform: "shopee", spend: 100, revenue: 500, orders: 4 },
    { date: "2026-11-02", platform: "tiktok", spend: 5, revenue: 0, orders: 0 },
  ]);
  assert.deepEqual(plain(body.shop).sort((a, b) => a.place.localeCompare(b.place)), [
    { date: "2026-11-03", place: "other", orders: 1, sales: 9 },
    { date: "2026-11-03", place: "shopee", orders: 1, sales: 400 },
  ]);
  assert.deepEqual(body.estimated, []);
  const monthly: any = await (await call("GET", "/api/clients/1/platforms?from=2026-10-01&to=2026-11-30&bucket=month")).json();
  assert.deepEqual([...new Set(monthly.ads.map((r: any) => r.date))], ["2026-10-01", "2026-11-01"]);
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
  assert.deepEqual(platforms.ads.filter((r: any) => r.platform === "meta").map((r: any) => [r.date, r.orders, r.revenue]), [["2026-11-03", 1, 150], ["2026-11-04", 1, 50]]);
  const { current }: any = await (await call("GET", `/api/clients/1/summary?${range}`)).json();
  assert.equal(current.purchases, 1);
  assert.equal(current.purchase_value, 400);
  assert.equal(current.spend, 0, "Spend stays Meta only");
  assert.equal(current.ad_spend, 100, "fees are not ads");
  assert.equal(current.roas, 4);
  assert.equal(current.cpa, 100);
});

test("only a client that sells through marketplaces is marked for the per-platform view", async () => {
  const { DB, call } = await setup();
  const marketplace = async () => ((await (await call("GET", "/api/clients/1/meta")).json()) as any).marketplace;
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'other','ads','2026-11-02',100),(1,'shopee','fee','2026-11-02',7)").run();
  assert.equal(await marketplace(), false);
  await DB.prepare("INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES (1,1,'a','2026-11-03','SHOPEE',400,0,1)").run();
  assert.equal(await marketplace(), true);
});
