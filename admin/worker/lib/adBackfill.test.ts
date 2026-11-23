import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { fetchEntityTree } from "./meta.ts";
import { backfillMissingAds } from "./sync.ts";

async function setup() {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'A','a')").run();
  await DB.prepare("INSERT INTO ad_accounts (id,client_id,meta_account_id,account_name,currency,timezone) VALUES (1,1,'act_1','A','IDR','Asia/Jakarta')").run();
  const insight = (id: string, spend: number) =>
    DB.prepare("INSERT INTO insights_daily (ad_account_id,level,entity_id,entity_name,parent_id,date,spend,impressions) VALUES (1,'ad',?,?,'s1','2026-11-20',?,10)").bind(id, `name-${id}`, spend).run();
  await insight("known", 100); await insight("new", 100); await insight("gone", 100); await insight("nospend", 0);
  await DB.prepare("INSERT INTO entities (ad_account_id,level,entity_id,name,thumbnail_url) VALUES (1,'ad','known','Known','https://cdn/known.jpg')").run();
  const env: any = { DB, JWT_SECRET: "x", META_ACCESS_TOKEN: "tok" };
  const account: any = { id: 1, meta_account_id: "act_1", currency: "IDR", timezone: "Asia/Jakarta" };
  return { DB, env, account };
}

function mockMeta(handler: (url: URL) => unknown) {
  const real = globalThis.fetch;
  const calls: URL[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    const out = handler(url) as any;
    return out instanceof Response ? out : Response.json(out);
  }) as any;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test("the entity lists ask Meta for archived and deleted items too", async () => {
  const { env } = await setup();
  const m = mockMeta(() => ({ data: [] }));
  try {
    await fetchEntityTree(env, "act_1");
    assert.equal(m.calls.length, 3);
    for (const u of m.calls) assert.match(u.searchParams.get("effective_status") ?? "", /ARCHIVED/);
  } finally { m.restore(); }
});

test("ads with spend but no record get one; ads Meta will not give are marked and not retried every hour", async () => {
  const { DB, env, account } = await setup();
  const m = mockMeta((u) => {
    const ids = (u.searchParams.get("ids") ?? "").split(",");
    assert.ok(!ids.includes("known") && !ids.includes("nospend"), "only ads that have spend and lack a record are asked for");
    if (!ids.includes("new")) return {}; // the week-later retry: "gone" is still not given
    return { new: { id: "new", name: "New ad", status: "ACTIVE", effective_status: "ACTIVE", adset_id: "s9", creative: { thumbnail_url: "https://cdn/new.jpg" } } };
  });
  try {
    assert.equal(await backfillMissingAds(env, account), 1);
    const rows = (await DB.prepare("SELECT entity_id, name, effective_status, thumbnail_url, parent_id FROM entities WHERE level='ad' ORDER BY entity_id").all<any>()).results;
    assert.deepEqual(rows.map((r: any) => [r.entity_id, r.name, r.effective_status, r.thumbnail_url, r.parent_id]), [
      ["gone", "name-gone", "UNAVAILABLE", null, "s1"],
      ["known", "Known", null, "https://cdn/known.jpg", null],
      ["new", "New ad", "ACTIVE", "https://cdn/new.jpg", "s9"],
    ]);
    const before = m.calls.length;
    assert.equal(await backfillMissingAds(env, account), 0);
    assert.equal(m.calls.length, before, "nothing left to ask for, so no request");
    await DB.prepare("UPDATE entities SET updated_at=datetime('now','-8 days') WHERE entity_id='gone'").run();
    await backfillMissingAds(env, account);
    assert.equal(m.calls.length, before + 1, "an unavailable ad is asked for again after a week");
  } finally { m.restore(); }
});

test("when Meta refuses a group because one id is unreadable, the others are still fetched one by one", async () => {
  const { DB, env, account } = await setup();
  const m = mockMeta((u) => {
    if (u.searchParams.get("ids")) return new Response(JSON.stringify({ error: { message: "Some of the aliases you requested do not exist", code: 100 } }), { status: 400 });
    if (u.pathname.endsWith("/new")) return { id: "new", name: "New ad", effective_status: "PAUSED", creative: { thumbnail_url: "https://cdn/new.jpg" } };
    return new Response(JSON.stringify({ error: { message: "Unsupported get request", code: 100 } }), { status: 400 });
  });
  try {
    assert.equal(await backfillMissingAds(env, account), 1);
    const r = await DB.prepare("SELECT thumbnail_url FROM entities WHERE entity_id='new'").first<any>();
    assert.equal(r.thumbnail_url, "https://cdn/new.jpg");
    assert.equal((await DB.prepare("SELECT effective_status s FROM entities WHERE entity_id='gone'").first<any>()).s, "UNAVAILABLE");
  } finally { m.restore(); }
});
