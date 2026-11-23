import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import clients from "./clients.ts";
import admin from "./admin.ts";

const SECRET = "test-secret";
async function setup() {
  const DB = makeDb();
  await DB.exec(`CREATE TRIGGER test_admin_mfa AFTER INSERT ON users WHEN NEW.role='admin'
    BEGIN INSERT INTO staff_mfa (user_id, secret_enc, confirmed, version) VALUES (NEW.id, 'test', 1, 1); END;`);
  await DB.exec(`
    INSERT INTO clients (id,name,slug,share_token,share_enabled) VALUES (1,'Alpha','alpha','tok1',1),(2,'Beta','beta','tok2',1);
    INSERT INTO users (id,email,password_hash,name,role,client_id,staff_role,client_role) VALUES
      (1,'a@x.test','h','Admin','admin',NULL,'owner',NULL),(2,'c1@x.test','h','Client1','client',1,NULL,'approver'),(3,'c2@x.test','h','Client2','client',2,NULL,'approver');
    INSERT INTO channels (id,client_id,platform,external_id,name) VALUES (1,1,'instagram','ig1','@alpha');
  `);
  const app = new Hono<any>();
  app.route("/api/clients", clients);
  app.route("/api/admin", admin);
  const env: any = { DB, JWT_SECRET: SECRET };
  const cookie = (id: number, _role?: string, _client_id?: number | null) => sessionCookie(env, id);
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

test("editorial details are saved without scheduling or publishing", async () => {
  const { DB, call, cookie } = await setup();
  const team = { cookie: await cookie(1, "admin", null) };
  const created = await call("POST", "/api/clients/1/plan/cards", team, { title: "Project brief" });
  const card = ((await created.json()) as any).card;
  const response = await call("PATCH", `/api/clients/1/plan/cards/${card.id}`, team, {
    progress: "Ready to Post", pillar: "Projects", campaign: "Campaign", platforms: "Meta Ads",
    reference_url: "https://example.org/brief", final_url: "https://example.org/final", posted_date: "2026-11-20",
  });
  assert.equal(response.status, 200);
  const updated = ((await response.json()) as any).card;
  assert.equal(updated.progress, "Ready to Post");
  assert.equal(updated.pillar, "Projects");
  assert.equal(updated.stage, "idea");
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM posts").first<any>())?.n, 0);
  assert.equal((await call("PATCH", `/api/clients/1/plan/cards/${card.id}`, team, { progress: "unknown" })).status, 400);
  assert.equal((await call("PATCH", `/api/clients/1/plan/cards/${card.id}`, team, { final_url: "javascript:alert(1)" })).status, 400);
});

test("planning comments and links are scoped to staff and validate links", async () => {
  const { call, cookie } = await setup();
  const team = { cookie: await cookie(1, "admin", null) };
  const client = { cookie: await cookie(2, "client", 1) };
  const created = await call("POST", "/api/clients/1/plan/cards", team, { title: "Brief" });
  const id = ((await created.json()) as any).card.id;
  const path = `/api/clients/1/plan/cards/${id}`;
  assert.equal((await call("GET", `${path}/details`, client)).status, 403);
  assert.equal((await call("POST", `${path}/comments`, team, { body: "  Feedback  " })).status, 201);
  assert.equal((await call("POST", `${path}/links`, team, { title: "Unsafe", url: "javascript:alert(1)" })).status, 400);
  assert.equal((await call("POST", `${path}/links`, team, { title: "Reference", url: "https://example.com/file" })).status, 201);
  const result = await (await call("GET", `${path}/details`, team)).json() as any;
  assert.equal(result.comments[0].body, "Feedback");
  assert.equal(result.comments[0].author_name, "Admin");
  assert.equal(result.links[0].url, "https://example.com/file");
  assert.equal((await call("GET", `/api/clients/2/plan/cards/${id}/details`, team)).status, 404);
});

test("content notifications are visible and markable only by their recipient", async () => {
  const { DB, call, cookie } = await setup();
  await DB.exec("INSERT INTO users (id,email,password_hash,name,role) VALUES (4,'other@x.test','h','Other','admin'); INSERT INTO content_plans (id,client_id,title) VALUES (7,1,'Example'); INSERT INTO content_workflow_notifications (id,recipient_user_id,plan_id,message) VALUES (9,1,7,'Review needed'),(10,4,7,'Private');");
  const team = { cookie: await cookie(1, "admin", null) };
  const client = { cookie: await cookie(2, "client", 1) };
  assert.equal((await call("GET", "/api/admin/plan/notifications", client)).status, 403);
  const list = (await (await call("GET", "/api/admin/plan/notifications", team)).json()) as any;
  assert.deepEqual(list.notifications.map((n: any) => n.id), [9]);
  assert.equal((await call("POST", "/api/admin/plan/notifications/10/read", team)).status, 404);
  assert.equal((await call("POST", "/api/admin/plan/notifications/9/read", team)).status, 200);
  assert.ok((await DB.prepare("SELECT read_at FROM content_workflow_notifications WHERE id=9").first<any>())?.read_at);
});

test("unassigned imports are visible only to staff without inventing a client", async () => {
  const { DB, call, cookie } = await setup();
  await DB.prepare("INSERT INTO content_import_review(source_id,title,progress,source_url) VALUES(?,?,?,?)").bind("0123456789abcdef0123456789abcdef", "Untitled project", "Ideation", "https://www.notion.so/0123456789abcdef0123456789abcdef").run();
  const client = { cookie: await cookie(2, "client", 1) };
  const team = { cookie: await cookie(1, "admin", null) };
  assert.equal((await call("GET", "/api/admin/plan/imports/review", client)).status, 403);
  const result = await (await call("GET", "/api/admin/plan/imports/review", team)).json() as any;
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "Untitled project");
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM content_plans").first<any>())?.n, 0);
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
