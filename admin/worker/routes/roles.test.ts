// Roles: every area is open only to the roles that own it, a team member only reaches their assigned
// clients, and a changed role applies on the very next request. The matrix drives the real app.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app } from "../index.ts";
import { STAFF_ROLES, staffCan, FEATURES } from "../../shared/permissions.ts";

const SECRET = "test-secret";
const TEAM = "https://app.musawara.id";
const PORTAL = "https://portal.musawara.id";

type Who = "owner" | "ads" | "content" | "crm" | "none";
const IDS: Record<Who, number> = { owner: 1, ads: 2, content: 3, crm: 4, none: 5 };

async function setup() {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Alpha','alpha'),(2,'Beta','beta')").run();
  await DB.prepare(
    `INSERT INTO users (id,email,password_hash,name,role,client_id,staff_role,client_role) VALUES
     (1,'o@x.test','h','Owner','admin',NULL,'owner',NULL), (2,'ads@x.test','h','Ads','admin',NULL,'ads',NULL),
     (3,'content@x.test','h','Content','admin',NULL,'content',NULL), (4,'crm@x.test','h','Crm','admin',NULL,'crm',NULL),
     (5,'none@x.test','h','NoRole','admin',NULL,NULL,NULL),
     (6,'viewer@x.test','h','Viewer','client',1,NULL,'viewer'), (7,'approver@x.test','h','Approver','client',1,NULL,'approver')`
  ).run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1),(3,1),(4,1)").run();
  await DB.prepare("INSERT INTO tasks (client_id,title) VALUES (1,'mine'),(2,'theirs')").run();
  const env: any = { DB, JWT_SECRET: SECRET };
  const call = async (id: number, method: string, path: string, body?: unknown, host = TEAM) =>
    app.request(host + path, {
      method,
      headers: { "content-type": "application/json", cookie: await sessionCookie(env, id, host) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
  return { DB, env, call };
}

/** [method, path, roles that may enter]. "Enter" = not refused with 401/403; the handler may still answer 400/404/503. */
const MATRIX: Array<[string, string, Who[]]> = [
  ["GET", "/api/admin/overview", ["owner", "ads"]],
  ["GET", "/api/admin/clients", ["owner", "ads", "content", "crm"]],
  ["POST", "/api/admin/clients", ["owner"]],
  ["DELETE", "/api/admin/clients/1/brand-links/1", ["owner", "content"]],
  ["POST", "/api/admin/clients/1/share", ["owner"]],
  ["GET", "/api/admin/clients/1/onboarding", ["owner"]],
  ["GET", "/api/admin/accounts", ["owner", "ads"]],
  ["POST", "/api/admin/clients/1/sync", ["owner", "ads"]],
  ["GET", "/api/admin/spend?from=2026-01-01&to=2026-01-31", ["owner", "ads"]],
  ["GET", "/api/admin/conversions/sales?client_id=1", ["owner", "ads", "crm"]],
  ["POST", "/api/admin/conversions/token", ["owner"]],
  ["GET", "/api/admin/plan/board", ["owner", "content"]],
  ["GET", "/api/admin/tasks", ["owner", "content"]],
  ["GET", "/api/admin/organic", ["owner", "content"]],
  ["GET", "/api/admin/organic/discover", ["owner"]],
  ["POST", "/api/admin/organic/poll", ["owner"]],
  ["GET", "/api/admin/publish/candidates", ["owner"]],
  ["GET", "/api/admin/users", ["owner"]],
  ["POST", "/api/admin/invites", ["owner"]],
  ["POST", "/api/admin/token", ["owner"]],
  ["GET", "/api/approvals", ["owner", "content"]],
  ["GET", "/api/approvals/1/assets", ["owner", "content"]],
  ["GET", "/api/approvals/1/requests", ["owner", "content"]],
  ["GET", "/api/crm/status", ["owner", "crm"]],
  ["GET", "/api/shopee/status?client_id=1", ["owner", "ads", "crm"]],
  ["DELETE", "/api/shopee/connection?client_id=1", ["owner"]],
  ["GET", "/api/notion/status", ["owner", "ads", "content", "crm"]],
  ["GET", "/api/clients/1/summary", ["owner", "ads"]],
  ["GET", "/api/clients/1/alerts", ["owner", "ads"]],
  ["GET", "/api/clients/1/meta", ["owner", "ads", "content", "crm"]],
  ["GET", "/api/clients/1/brand", ["owner", "ads", "content", "crm"]],
  ["GET", "/api/clients/1/publish/channels", ["owner", "content"]],
  ["GET", "/api/clients/1/plan/board", ["owner", "content"]],
  ["GET", "/api/report/1", ["owner", "ads"]],
];

test("each route opens only to the roles that own its feature", async () => {
  const { call } = await setup();
  for (const [method, path, allowed] of MATRIX) {
    for (const who of Object.keys(IDS) as Who[]) {
      const res = await call(IDS[who], method, path, method === "GET" ? undefined : {});
      const refused = res.status === 401 || res.status === 403;
      assert.equal(refused, !allowed.includes(who), `${who} ${method} ${path} -> ${res.status}`);
    }
  }
});

test("the permission map and the route matrix agree on who owns what", () => {
  assert.deepEqual([...STAFF_ROLES], ["owner", "ads", "content", "crm"]);
  assert.ok(FEATURES.every((f) => staffCan("owner", f)), "Owner has every feature");
  assert.equal(staffCan("ads", "settings"), false);
  assert.equal(staffCan("content", "spend"), false);
  assert.equal(staffCan(null, "ads"), false, "no role, no access");
  assert.equal(staffCan("hacker", "ads"), false);
});

test("a team member never reaches a client they are not assigned to", async () => {
  const { call } = await setup();
  const cases: Array<[number, string, string, unknown?]> = [
    [IDS.ads, "GET", "/api/clients/2/summary"],
    [IDS.ads, "GET", "/api/report/2"],
    [IDS.ads, "GET", "/api/shopee/status?client_id=2"],
    [IDS.ads, "GET", "/api/admin/conversions/sales?client_id=2"],
    [IDS.ads, "POST", "/api/admin/accounts", { client_id: 2, meta_account_id: "123" }],
    [IDS.ads, "POST", "/api/admin/clients/2/sync"],
    [IDS.content, "GET", "/api/admin/plan/board?client_id=2"],
    [IDS.content, "GET", "/api/clients/2/plan/board"],
    [IDS.content, "POST", "/api/admin/plan/cards", { client_id: 2, title: "x" }],
    [IDS.content, "POST", "/api/admin/tasks", { client_id: 2, title: "x" }],
    [IDS.content, "GET", "/api/approvals/2/assets"],
    [IDS.crm, "GET", "/api/admin/conversions/sales?client_id=2"],
  ];
  for (const [id, method, path, body] of cases) {
    const res = await call(id, method, path, body);
    assert.equal(res.status, 403, `${method} ${path} -> ${res.status}`);
  }
});

test("lists are filtered to the assigned clients, and owners see all", async () => {
  const { call, DB } = await setup();
  const names = async (id: number, path: string, key: string, field = "client_name") =>
    ((await (await call(id, "GET", path)).json()) as any)[key].map((r: any) => r[field]).sort();
  assert.deepEqual(await names(IDS.owner, "/api/admin/clients", "clients", "name"), ["Alpha", "Beta"]);
  assert.deepEqual(await names(IDS.ads, "/api/admin/clients", "clients", "name"), ["Alpha"]);
  assert.deepEqual(await names(IDS.content, "/api/admin/tasks", "tasks"), ["Alpha"]);
  assert.deepEqual(await names(IDS.owner, "/api/admin/tasks", "tasks"), ["Alpha", "Beta"]);
  const overview = (await (await call(IDS.ads, "GET", "/api/admin/overview")).json()) as any;
  assert.deepEqual(overview.clients.map((c: any) => c.name), ["Alpha"]);
  // Someone assigned to nothing sees nothing rather than everything.
  await DB.prepare("DELETE FROM user_clients WHERE user_id=2").run();
  const empty = (await (await call(IDS.ads, "GET", "/api/admin/overview")).json()) as any;
  assert.deepEqual(empty.clients, []);
});

test("a task of another client cannot be changed or deleted by a scoped member", async () => {
  const { call, DB } = await setup();
  const theirs = (await DB.prepare("SELECT id FROM tasks WHERE title='theirs'").first<{ id: number }>())!.id;
  assert.equal((await call(IDS.content, "DELETE", `/api/admin/tasks/${theirs}`)).status, 403);
  assert.equal((await call(IDS.content, "PUT", `/api/admin/tasks/${theirs}`, { title: "x" })).status, 403);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM tasks").first<{ n: number }>())!.n, 2);
});

test("a changed role applies on the next request, with the same cookie", async () => {
  const { call, DB } = await setup();
  assert.notEqual((await call(IDS.ads, "GET", "/api/admin/overview")).status, 403);
  await DB.prepare("UPDATE users SET staff_role='crm' WHERE id=2").run();
  assert.equal((await call(IDS.ads, "GET", "/api/admin/overview")).status, 403);
  await DB.prepare("UPDATE users SET staff_role=NULL WHERE id=2").run();
  assert.equal((await call(IDS.ads, "GET", "/api/admin/clients")).status, 403, "no role, no access");
});

test("client viewers read approvals but only approvers decide", async () => {
  const { call } = await setup();
  assert.equal((await call(6, "GET", "/api/approvals/1/requests", undefined, PORTAL)).status, 200);
  assert.equal((await call(6, "POST", "/api/approvals/1/requests/1/decision", { decision: "approved" }, PORTAL)).status, 403);
  assert.notEqual((await call(7, "POST", "/api/approvals/1/requests/1/decision", { decision: "approved" }, PORTAL)).status, 403);
});

test("invites carry a role; assignments follow the invite; the last Owner cannot be demoted", async () => {
  const { call, DB } = await setup();
  assert.equal((await call(IDS.owner, "POST", "/api/admin/invites", { staff_role: "ads" })).status, 400, "a scoped role needs clients");
  assert.equal((await call(IDS.owner, "POST", "/api/admin/invites", { staff_role: "boss" })).status, 400);
  assert.equal((await call(IDS.owner, "POST", "/api/admin/invites", { audience: "client", client_role: "viewer" })).status, 400);
  const made = (await (await call(IDS.owner, "POST", "/api/admin/invites", { staff_role: "content", client_ids: [2, 999] })).json()) as any;
  const accepted = await app.request(`${TEAM}/api/auth/invites/${made.token}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New", email: "new@x.test", password: "longenough1" }),
  }, { DB, JWT_SECRET: SECRET } as any);
  assert.equal(accepted.status, 200);
  const user = (await DB.prepare("SELECT id, staff_role FROM users WHERE email='new@x.test'").first<any>())!;
  assert.equal(user.staff_role, "content");
  const rows = await DB.prepare("SELECT client_id FROM user_clients WHERE user_id=?").bind(user.id).all<any>();
  assert.deepEqual(rows.results.map((r) => r.client_id), [2], "unknown client ids are dropped");

  assert.equal((await call(IDS.owner, "PUT", `/api/admin/users/${IDS.owner}`, { staff_role: "ads", client_ids: [1] })).status, 400, "the only Owner stays Owner");
  assert.equal((await call(IDS.owner, "PUT", `/api/admin/users/${IDS.ads}`, { staff_role: "content", client_ids: [1, 2] })).status, 200);
  const moved = await DB.prepare("SELECT client_id FROM user_clients WHERE user_id=? ORDER BY client_id").bind(IDS.ads).all<any>();
  assert.deepEqual(moved.results.map((r) => r.client_id), [1, 2]);
  assert.equal((await call(IDS.owner, "GET", "/api/admin/plan/board", undefined)).status, 200);

  // A client login switches between viewer and approver; a team member cannot be given a client role.
  assert.equal((await call(IDS.owner, "PUT", "/api/admin/users/6", { client_role: "approver" })).status, 200);
  assert.equal((await DB.prepare("SELECT client_role FROM users WHERE id=6").first<any>())!.client_role, "approver");
  assert.equal((await call(IDS.owner, "PUT", "/api/admin/users/6", { client_role: "boss" })).status, 400);
  assert.equal((await call(IDS.owner, "PUT", "/api/admin/users/7", { client_role: "viewer" })).status, 200);
  assert.equal((await call(IDS.owner, "PUT", `/api/admin/users/${IDS.ads}`, { client_role: "viewer" })).status, 400);
});

test("CRM: a non-owner only reaches WhatsApp numbers of their own clients, never the default number", async () => {
  const { DB } = await setup();
  const calls: Array<{ url: string; account: string | null }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    calls.push({ url, account: new Headers(init?.headers).get("x-wa-account") });
    if (url.endsWith("/api/accounts")) return Response.json([{ id: 1, client_id: null }, { id: 2, client_id: "1" }, { id: 3, client_id: "2" }]); // the real gateway sends client_id as text
    return Response.json({ ok: true });
  }) as any;
  const env: any = { DB, JWT_SECRET: SECRET, WA_GATEWAY_URL: "https://gw.test", WA_GATEWAY_TOKEN: "t" };
  const crm = async (id: number, method: string, path: string, account?: string) =>
    app.request(TEAM + "/api/crm" + path, {
      method,
      headers: { cookie: await sessionCookie(env, id, TEAM), ...(account ? { "x-wa-account": account } : {}) },
    }, env);
  try {
    // CRM member assigned to client 1 (user 4)
    assert.equal((await crm(4, "GET", "/contacts")).status, 400, "no number picked: refused, not sent to the default number");
    assert.equal((await crm(4, "GET", "/contacts", "1")).status, 403, "the default number (NurAlive) belongs to no assigned client");
    assert.equal((await crm(4, "GET", "/contacts", "3")).status, 403, "a number of another client");
    assert.equal((await crm(4, "GET", "/contacts?account=1", "2")).status, 200, "own number, with a smuggled ?account= that is dropped");
    const sent = calls.at(-1)!;
    assert.equal(sent.account, "2");
    assert.ok(!sent.url.includes("account="), sent.url);
    assert.equal((await crm(4, "GET", "/contacts?account=3")).status, 403, "query param cannot pick another number either");
    assert.equal((await crm(4, "POST", "/accounts")).status, 403, "creating numbers is Owner work");
    assert.equal((await crm(4, "GET", "/accounts/1/status")).status, 403, "no QR or status of numbers that are not theirs");
    assert.equal((await crm(4, "GET", "/attendees", "2")).status, 403, "event features are bound to the default number: Owner only");
    const list = (await (await crm(4, "GET", "/accounts")).json()) as Array<{ id: number }>;
    assert.deepEqual(list.map((a) => a.id), [2], "the number list is cut down to their own");
    // Owner: unchanged, any number and the default
    assert.equal((await crm(1, "GET", "/contacts")).status, 200);
    assert.equal((await crm(1, "GET", "/contacts", "3")).status, 200);
    assert.equal(((await (await crm(1, "GET", "/accounts")).json()) as any[]).length, 3);
  } finally {
    globalThis.fetch = real;
  }
});
