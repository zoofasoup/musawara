import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { sameClient, formatFromKind, kindFromFormat, progressToPush, stageFromProgress, syncNotion } from "../lib/notion.ts";

const T0 = "2026-11-17T10:00:00.000Z";
const page = (id: string, o: { title: string; client?: string; progress?: string; format?: string; target?: string; pillar?: string; edited?: string }) => ({
  id, last_edited_time: o.edited ?? T0,
  properties: {
    "Content Name/Idea": { title: [{ plain_text: o.title }] },
    Client: { select: o.client ? { name: o.client } : null },
    Progress: { status: o.progress ? { name: o.progress } : null },
    Format: { select: o.format ? { name: o.format } : null },
    "Target Post": { date: o.target ? { start: o.target } : null },
    Pillar: { select: o.pillar ? { name: o.pillar } : null },
  },
});

function fakeNotion(pages: any[], log: { method: string; path: string; body?: any }[] = []) {
  let n = 0;
  return (async (url: string, init: any = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ method: init.method, path: u.pathname, body });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (init.method === "GET" && u.pathname.startsWith("/v1/databases/")) return ok({ properties: { Client: { select: { options: [{ name: "Nuralive" }, { name: "Musafar" }] } } } });
    if (u.pathname.endsWith("/query")) return ok({ results: pages, has_more: false });
    if (init.method === "POST" && u.pathname === "/v1/pages") return ok({ id: "new-" + ++n, last_edited_time: "2026-11-17T11:00:00.000Z" });
    if (init.method === "PATCH") return ok({ id: u.pathname.split("/").pop(), last_edited_time: "2026-11-17T11:05:00.000Z" });
    if (init.method === "GET" && u.pathname.startsWith("/v1/pages/")) return ok(pages.find((p) => p.id === u.pathname.split("/").pop()) ?? { id: "x", properties: {}, last_edited_time: T0 });
    return new Response(JSON.stringify({ message: "nope" }), { status: 404 });
  }) as unknown as typeof fetch;
}

async function setup() {
  const DB = makeDb();
  await DB.exec(`INSERT INTO clients (id,name,slug,share_token,share_enabled) VALUES (1,'NurAlive','nuralive','t1',1),(2,'Other','other','t2',1);`);
  return { DB, env: { DB, NOTION_TOKEN: "secret" } as any };
}

test("stage and format mapping", () => {
  assert.equal(stageFromProgress("Design / Editing"), "drafting");
  assert.equal(stageFromProgress("Ready to Post"), "in_review");
  for (const p of ["Scheduled", "Posted", "Failed"]) assert.equal(stageFromProgress(p), null);
  assert.equal(progressToPush("drafting", "Production"), null); // Notion's finer step already means drafting
  assert.equal(progressToPush("drafting", "Ideation"), "Copy / Script");
  assert.equal(progressToPush("scheduled", "Posted"), null);
  assert.equal(progressToPush("published", "Scheduled"), "Posted");
  assert.equal(kindFromFormat("Long-form Video"), "reel");
  assert.equal(formatFromKind("carousel"), "Carousel");
});

test("client names match across spellings but not on a shared first letter", () => {
  assert.ok(sameClient("Musafar Tour & Travel", "Musafar"));
  assert.ok(sameClient("NurAlive", "Nuralive"));
  assert.ok(!sameClient("Musa", "Musafar"));
  assert.ok(!sameClient("", "Musafar"));
});

test("without a token nothing is called", async () => {
  const { DB } = await setup();
  await assert.rejects(() => syncNotion({ DB } as any, fakeNotion([])), /NOTION_TOKEN/);
});

test("imported snapshot cards are never pulled or pushed by legacy sync", async () => {
  const { DB, env } = await setup();
  const id = "0123456789abcdef0123456789abcdef";
  await DB.prepare("INSERT INTO content_plans (client_id,title,source_notion_id) VALUES (1,'Snapshot',?)").bind(id).run();
  const log: any[] = [];
  const result = await syncNotion(env, fakeNotion([page("01234567-89ab-cdef-0123-456789abcdef", { title: "Source changed", client: "Nuralive" })], log));
  assert.equal(result.pulled_new + result.pulled_updated + result.pushed_new + result.pushed_updated, 0);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM content_plans").first<any>())?.n, 1);
  assert.equal((await DB.prepare("SELECT title FROM content_plans").first<any>())?.title, "Snapshot");
  assert.equal(log.some((entry) => entry.path === "/v1/pages" || entry.method === "PATCH"), false);
});

test("a new app card is created in Notion with the board's own client name, then not duplicated", async () => {
  const { DB, env } = await setup();
  await DB.exec(`INSERT INTO content_plans (client_id,title,brief,kind,stage,planned_date) VALUES (1,'Reel padel','brief text','reel','drafting','2026-11-20')`);
  const log: any[] = [];
  const r = await syncNotion(env, fakeNotion([], log));
  assert.equal(r.pushed_new, 1);
  const created = log.find((l) => l.method === "POST" && l.path === "/v1/pages").body;
  assert.equal(created.properties.Client.select.name, "Nuralive");
  assert.equal(created.properties.Progress.status.name, "Copy / Script");
  assert.equal(created.properties.Format.select.name, "Short-form video");
  assert.equal(created.properties.Platform, undefined); // Do not invent a destination.
  assert.equal(created.properties["Target Post"].date.start, "2026-11-20");
  const row = await DB.prepare("SELECT notion_page_id FROM content_plans").first<any>();
  assert.equal(row.notion_page_id, "new-1");
  const again = await syncNotion(env, fakeNotion([], []));
  assert.equal(again.pushed_new + again.pushed_updated, 0);
});

test("pagination continues past 1,000 records without silently dropping later pages", async () => {
  const { env } = await setup();
  const base = fakeNotion([]);
  let calls = 0;
  const fetcher = (async (url: string, init: any = {}) => {
    if (url.endsWith("/query")) {
      calls++;
      const records = calls <= 10 ? Array.from({ length: 100 }, (_, i) => page(`${calls}-${i}`, { title: "Skipped", client: "Unknown" })) : [page("last", { title: "Last record", client: "Nuralive" })];
      return new Response(JSON.stringify({ results: records, has_more: calls <= 10, next_cursor: calls <= 10 ? `cursor-${calls}` : null }));
    }
    return base(url, init);
  }) as unknown as typeof fetch;
  const result = await syncNotion(env, fetcher);
  assert.equal(calls, 11);
  assert.equal(result.pulled_new, 1);
});

test("invalid pagination stops instead of claiming a complete sync", async () => {
  const { env } = await setup();
  const base = fakeNotion([]);
  const fetcher = (async (url: string, init: any = {}) => url.endsWith("/query")
    ? new Response(JSON.stringify({ results: [], has_more: true, next_cursor: null }))
    : base(url, init)) as unknown as typeof fetch;
  await assert.rejects(() => syncNotion(env, fetcher), /invalid pagination cursor/);
});

test("a Notion page for a known client becomes a card; unknown client, Projects, and Posted are skipped", async () => {
  const { DB, env } = await setup();
  const r = await syncNotion(env, fakeNotion([
    page("p1", { title: "Ide baru", client: "Nuralive", progress: "Review Visual", format: "Carousel", target: "2026-11-25" }),
    page("p2", { title: "Tanpa klien", client: "All", progress: "Ideation" }),
    page("p3", { title: "Merch", client: "Nuralive", progress: "Ideation", pillar: "Projects" }),
    page("p4", { title: "Sudah tayang", client: "Nuralive", progress: "Posted" }),
  ]));
  assert.equal(r.pulled_new, 1);
  assert.equal(r.skipped, 3);
  const c = await DB.prepare("SELECT * FROM content_plans").first<any>();
  assert.deepEqual([c.title, c.stage, c.kind, c.planned_date, c.client_id], ["Ide baru", "in_review", "carousel", "2026-11-25", 1]);
});

test("Notion edit wins when newer; Notion Scheduled never moves an app card; the app edit wins when newer", async () => {
  const { DB, env } = await setup();
  await DB.exec(`INSERT INTO content_plans (id,client_id,title,kind,stage,notion_page_id,notion_edited_at,notion_synced_at,updated_at)
    VALUES (1,1,'Lama','feed','idea','p1','2026-11-17T09:00:00.000Z','2026-11-17 09:00:00','2026-11-17 09:00:00'),
           (2,1,'App terbaru','feed','idea','p2','2026-11-17T09:00:00.000Z','2026-11-17 09:00:00','2026-11-17 09:30:00')`);
  await syncNotion(env, fakeNotion([
    page("p1", { title: "Judul dari Notion", client: "Nuralive", progress: "Scheduled", edited: "2026-11-17T10:00:00.000Z" }),
    page("p2", { title: "Notion lebih lama", client: "Nuralive", progress: "Ideation", edited: "2026-11-17T09:10:00.000Z" }),
  ]));
  const one = await DB.prepare("SELECT title, stage FROM content_plans WHERE id=1").first<any>();
  assert.deepEqual([one.title, one.stage], ["Judul dari Notion", "idea"]);
  const two = await DB.prepare("SELECT title FROM content_plans WHERE id=2").first<any>();
  assert.equal(two.title, "App terbaru");
});
