import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { makeDb } from "../testkit/d1.ts";
import clients from "./clients.ts";
import admin from "./admin.ts";

const SECRET = "test-secret";
async function setup() {
  const DB = makeDb();
  await DB.exec(`
    INSERT INTO clients (id,name,slug,share_token,share_enabled) VALUES (1,'Alpha','alpha','tok1',1),(2,'Beta','beta','tok2',1);
    INSERT INTO users (id,email,password_hash,name,role,client_id) VALUES
      (1,'a@x','h','Admin','admin',NULL),(2,'c1@x','h','Client1','client',1),(3,'c2@x','h','Client2','client',2);
    INSERT INTO channels (id,client_id,platform,external_id,name) VALUES (1,1,'instagram','ig1','@alpha');
  `);
  const app = new Hono<any>();
  app.route("/api/clients", clients);
  app.route("/api/admin", admin);
  const env: any = { DB, JWT_SECRET: SECRET };
  const cookie = async (id: number, role: string, client_id: number | null) =>
    `ma_session=${await sign({ sub: id, email: "e", name: "n", role, client_id, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
  const call = async (method: string, path: string, who: { cookie?: string; share?: string }, body?: unknown) =>
    app.request(path, {
      method,
      headers: { ...(who.cookie ? { cookie: who.cookie } : {}), ...(who.share ? { "X-Share-Token": who.share } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
  return { DB, call, cookie };
}

test("client users and share links cannot read or write planning data", async () => {
  const { call, cookie } = await setup();
  const client = { cookie: await cookie(2, "client", 1) };
  for (const [m, p] of [["GET", "/api/clients/1/plan/board"], ["GET", "/api/clients/1/plan/calendar?from=2026-11-01&to=2026-11-30"], ["POST", "/api/clients/1/plan/cards"]] as const) {
    assert.equal((await call(m, p, client, m === "POST" ? { title: "x" } : undefined)).status, 403, `${m} ${p}`);
  }
  assert.equal((await call("GET", "/api/clients/1/plan/board", { share: "tok1" })).status, 403);
  assert.equal((await call("GET", "/api/clients/1/plan/board", {})).status, 401);
  // another client's user is stopped by clientAccess before reaching the module
  assert.equal((await call("GET", "/api/clients/1/plan/board", { cookie: await cookie(3, "client", 2) })).status, 403);
  // the all-clients mount is admin only
  assert.equal((await call("GET", "/api/admin/plan/board", client)).status, 403);
  assert.equal((await call("GET", "/api/admin/plan/board", {})).status, 401);
});

test("team can create, edit, move and delete cards, per client and across clients", async () => {
  const { call, cookie } = await setup();
  const team = { cookie: await cookie(1, "admin", null) };
  const r = await call("POST", "/api/clients/1/plan/cards", team, { title: "Launch reel", planned_date: "2026-11-20", owner_user_id: 1 });
  assert.equal(r.status, 201);
  const card = ((await r.json()) as any).card;
  assert.equal(card.stage, "idea");
  assert.equal(card.owner_name, "Admin");

  // all-clients create needs client_id
  assert.equal((await call("POST", "/api/admin/plan/cards", team, { title: "x" })).status, 400);
  assert.equal((await call("POST", "/api/admin/plan/cards", team, { title: "Beta idea", client_id: 2 })).status, 201);

  assert.equal(((await (await call("GET", "/api/clients/1/plan/board", team)).json()) as any).cards.length, 1);
  assert.equal(((await (await call("GET", "/api/admin/plan/board", team)).json()) as any).cards.length, 2);
  assert.equal(((await (await call("GET", "/api/admin/plan/board?client_id=2", team)).json()) as any).cards.length, 1);

  // a card from another client is not reachable through this client's route
  assert.equal((await call("POST", `/api/clients/2/plan/cards/${card.id}/move`, team, { stage: "drafting" })).status, 404);

  assert.equal((await call("POST", `/api/clients/1/plan/cards/${card.id}/move`, team, { stage: "drafting" })).status, 200);
  assert.equal((await call("POST", `/api/clients/1/plan/cards/${card.id}/move`, team, { stage: "scheduled" })).status, 409);
  assert.equal((await call("POST", `/api/clients/1/plan/cards/${card.id}/move`, team, { stage: "published" })).status, 409);
  assert.equal((await call("POST", `/api/clients/1/plan/cards/${card.id}/move`, team, { stage: "nope" })).status, 400);
  assert.equal((await call("PATCH", `/api/clients/1/plan/cards/${card.id}`, team, { stage: "published" })).status, 400);
  assert.equal((await call("DELETE", `/api/clients/1/plan/cards/${card.id}`, team)).status, 200);
});

test("linking a scheduled post moves the card forward; moving or deleting a card never touches the post", async () => {
  const { DB, call, cookie } = await setup();
  const team = { cookie: await cookie(1, "admin", null) };
  await DB.exec(`INSERT INTO posts (id,client_id,status,kind,caption,scheduled_at) VALUES
    (10,1,'scheduled','feed','hello','2026-11-20 03:00:00'),(11,1,'draft','feed','d',NULL),(12,2,'published','feed','other','2026-11-01 03:00:00')`);
  const mk = async (title: string, extra: any = {}) =>
    ((await (await call("POST", "/api/clients/1/plan/cards", team, { title, ...extra })).json()) as any).card;

  const a = await mk("A", { post_id: 10 });
  assert.equal(a.stage, "scheduled"); // synced forward on link
  // cannot link another client's post, nor one already linked
  assert.equal((await call("POST", "/api/clients/1/plan/cards", team, { title: "B", post_id: 12 })).status, 400);
  assert.equal((await call("POST", "/api/clients/1/plan/cards", team, { title: "B", post_id: 10 })).status, 400);

  // locked to the post while it is scheduled
  assert.equal((await call("POST", `/api/clients/1/plan/cards/${a.id}/move`, team, { stage: "drafting" })).status, 409);

  // the post gets published in Publish: the card follows on the next read
  await DB.exec("UPDATE posts SET status='published' WHERE id=10");
  let board = ((await (await call("GET", "/api/clients/1/plan/board", team)).json()) as any).cards;
  assert.equal(board.find((c: any) => c.id === a.id).stage, "published");

  // the reverse never happens: the post rolls back, the card stays put
  await DB.exec("UPDATE posts SET status='failed' WHERE id=10");
  board = ((await (await call("GET", "/api/clients/1/plan/board", team)).json()) as any).cards;
  assert.equal(board.find((c: any) => c.id === a.id).stage, "published");

  // a draft-linked card moved around freely leaves the draft post alone
  const d = await mk("D", { post_id: 11 });
  assert.equal(d.stage, "idea");
  await call("POST", `/api/clients/1/plan/cards/${d.id}/move`, team, { stage: "in_review" });
  await call("DELETE", `/api/clients/1/plan/cards/${d.id}`, team);
  const posts = (await DB.prepare("SELECT id,status,scheduled_at FROM posts ORDER BY id").all<any>()).results;
  assert.deepEqual(posts.map((p) => [p.id, p.status]), [[10, "failed"], [11, "draft"], [12, "published"]]);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM post_targets").first<any>()).n, 0);
});

test("calendar buckets posts by Jakarta day and lists unlinked cards by planned date", async () => {
  const { DB, call, cookie } = await setup();
  const team = { cookie: await cookie(1, "admin", null) };
  await DB.exec(`INSERT INTO posts (id,client_id,status,kind,caption,scheduled_at) VALUES
    (1,1,'scheduled','feed','late','2026-11-12 17:30:00'),   -- 13 Nov 00:30 WIB
    (2,1,'scheduled','feed','early','2026-11-12 16:30:00'),  -- 12 Nov 23:30 WIB
    (3,1,'draft','feed','out of range','2026-12-20 03:00:00'),
    (4,2,'published','feed','beta','2026-11-13 02:00:00')`);
  await call("POST", "/api/clients/1/plan/cards", team, { title: "Idea on 13th", planned_date: "2026-11-13" });
  const res = (await (await call("GET", "/api/clients/1/plan/calendar?from=2026-11-01&to=2026-11-30", team)).json()) as any;
  assert.deepEqual(res.posts.map((p: any) => [p.id, p.day]), [[2, "2026-11-12"], [1, "2026-11-13"]]);
  assert.deepEqual(res.counts, { "2026-11-12": 1, "2026-11-13": 1 });
  assert.equal(res.cards.length, 1);
  // range edges are Jakarta days: from=13th excludes the 23:30 WIB post on the 12th
  const edge = (await (await call("GET", "/api/clients/1/plan/calendar?from=2026-11-13&to=2026-11-13", team)).json()) as any;
  assert.deepEqual(edge.posts.map((p: any) => p.id), [1]);
  // all-clients view
  const all = (await (await call("GET", "/api/admin/plan/calendar?from=2026-11-01&to=2026-11-30", team)).json()) as any;
  assert.deepEqual(all.posts.map((p: any) => p.id), [2, 1, 4]);
  assert.equal((await call("GET", "/api/clients/1/plan/calendar?from=bad&to=2026-11-30", team)).status, 400);
});
