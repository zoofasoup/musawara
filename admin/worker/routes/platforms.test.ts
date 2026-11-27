// Overview per platform: ad spend next to sales per sales channel, and one sync button that also reads Jubelio.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";
import { platformRows } from "../lib/platforms.ts";

const HOST = "https://app.musawara.id";

test("rows pair spend with the sales channel of the same platform and never invent a return", () => {
  assert.deepEqual(
    platformRows(
      [{ source: "meta", amount: 1000 }, { source: "shopee", amount: 100 }, { source: "tiktok", amount: 40 }, { source: "tokopedia", amount: 10 }],
      [{ source: "Shopee", orders: 3, value: 500 }, { source: "TikTok / Tokopedia Shop", orders: 1, value: 80 }, { source: "Tokopedia", orders: 1, value: 20 }, { source: "Manual (internal)", orders: 2, value: 300 }],
    ),
    [
      { platform: "Meta ads", spend: 1000, orders: 0, sales: 0, ratio: null },
      { platform: "Shopee", spend: 100, orders: 3, sales: 500, ratio: 5 },
      { platform: "TikTok / Tokopedia", spend: 50, orders: 2, sales: 100, ratio: 2 },
      { platform: "Manual (internal)", spend: 0, orders: 2, sales: 300, ratio: null },
    ],
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

test("the platforms route counts paid orders and spend inside the range", async () => {
  const { DB, call } = await setup();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount) VALUES (1,'shopee','ads','2026-11-02',100),(1,'shopee','ads','2026-10-30',999)").run();
  await DB.prepare(
    `INSERT INTO jubelio_orders (client_id,salesorder_id,order_no,day,channel,total,canceled,paid) VALUES
     (1,1,'a','2026-11-03','SHOPEE',400,0,1),(1,2,'b','2026-11-03','SHOPEE',700,1,0),(1,3,'c','2026-10-01','SHOPEE',5,0,1)`
  ).run();
  const res = await call("GET", "/api/clients/1/platforms?from=2026-11-01&to=2026-11-30");
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as any).rows, [{ platform: "Shopee", spend: 100, orders: 1, sales: 400, ratio: 4 }]);
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
