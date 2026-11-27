// Importing a marketplace ad report: re-importing a day replaces what the earlier import wrote, hand-typed entries stay.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";

const HOST = "https://app.musawara.id";

async function setup() {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'A','a'),(2,'B','b')").run();
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES (1,'o@x.test','h','O','admin','owner'),(2,'ads@x.test','h','Ads','admin','ads')").run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1)").run();
  await DB.prepare("INSERT INTO spend_entries (client_id,source,category,date,amount,note) VALUES (1,'tiktok','ads','2026-09-01',7,'typed by hand')").run();
  const env: any = { DB, JWT_SECRET: "test-secret" };
  const post = async (userId: number, body: unknown) =>
    app.request(HOST + "/api/admin/spend/import", { method: "POST", headers: { "content-type": "application/json", cookie: await sessionCookie(env, userId, HOST) }, body: JSON.stringify(body) }, env);
  const rows = async () => (await DB.prepare("SELECT date, amount FROM spend_entries WHERE client_id=1 AND source='tiktok' ORDER BY date, amount").all<{ date: string; amount: number }>()).results.map((r) => `${r.date}:${r.amount}`);
  return { post, rows, DB };
}

test("a second import replaces the first and keeps hand-typed entries", async () => {
  const { post, rows } = await setup();
  const first = await post(1, { source: "tiktok", client_id: 1, rows: [{ date: "2026-09-01", amount: 100 }, { date: "2026-09-02", amount: 50 }] });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { days: 2, total: 150, manual_days: 1 });
  await post(1, { source: "tiktok", client_id: 1, rows: [{ date: "2026-09-01", amount: 120 }, { date: "2026-09-02", amount: 0 }] });
  assert.deepEqual(await rows(), ["2026-09-01:7", "2026-09-01:120"]);
});

test("bad input and other people's clients are refused", async () => {
  const { post, rows } = await setup();
  for (const body of [
    { source: "meta", client_id: 1, rows: [{ date: "2026-09-01", amount: 1 }] },
    { source: "tiktok", client_id: 1, rows: [] },
    { source: "tiktok", client_id: 1, rows: [{ date: "01/09/2026", amount: 1 }] },
    { source: "tiktok", client_id: 1, rows: [{ date: "2026-09-01", amount: -1 }] },
    { source: "tiktok", client_id: 1, rows: [{ date: "2026-09-01", amount: 1 }, { date: "2026-09-01", amount: 2 }] },
    { source: "tiktok", client_id: 99, rows: [{ date: "2026-09-01", amount: 1 }] },
  ]) assert.equal((await post(1, body)).status, 400, JSON.stringify(body));
  assert.equal((await post(2, { source: "tiktok", client_id: 2, rows: [{ date: "2026-09-01", amount: 1 }] })).status, 403);
  assert.equal((await post(2, { source: "tiktok", client_id: null, rows: [{ date: "2026-09-01", amount: 1 }] })).status, 403);
  assert.deepEqual(await rows(), ["2026-09-01:7"]);
});

test("a period replaces what was imported inside it, and the platform's own results are kept per client", async () => {
  const { post, rows, DB } = await setup();
  const month = (to: string, amount: number) => ({ source: "tiktok", client_id: 1, from: "2026-11-01", to, rows: [{ date: to, amount, revenue: amount * 2, orders: 3 }] });
  assert.equal((await post(1, month("2026-11-27", 500))).status, 200);
  assert.equal((await post(1, month("2026-11-30", 700))).status, 200);
  assert.deepEqual(await rows(), ["2026-09-01:7", "2026-11-30:700"]);
  const results = (await DB.prepare("SELECT date, revenue, orders FROM ad_results").all<any>()).results.map((r: any) => ({ ...r }));
  assert.deepEqual(results, [{ date: "2026-11-30", revenue: 1400, orders: 3 }]);
  assert.equal((await post(1, { ...month("2026-11-30", 1), from: "2026-12-01" })).status, 400, "rows must lie inside the period");
  assert.equal((await post(1, { source: "tiktok", client_id: 1, rows: [{ date: "2026-11-01", amount: 1, revenue: -2 }] })).status, 400);
});
