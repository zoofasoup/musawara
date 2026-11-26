// APP_MODE=crm: only the CRM, sign-in and team routes answer; everything of the agency platform is 404.
import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../testkit/session.ts";
import { makeDb } from "../testkit/d1.ts";
import { app, scheduled } from "../index.ts";
import { crmAllows } from "../../shared/mode.ts";
import { presetsFor } from "../lib/crmPresets.ts";

const SECRET = "test-secret";
const HOST = "https://toko.crm.test";

async function setup(mode?: string) {
  const DB = makeDb();
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Toko','toko')").run();
  await DB.prepare(
    `INSERT INTO users (id,email,password_hash,name,role,staff_role) VALUES
     (1,'o@x.test','h','Owner','admin','owner'), (2,'crm@x.test','h','Crm','admin','crm')`
  ).run();
  await DB.prepare("INSERT INTO user_clients (user_id, client_id) VALUES (2,1)").run();
  const env: any = { DB, JWT_SECRET: SECRET, APP_MODE: mode };
  const call = async (id: number, method: string, path: string, body?: unknown) =>
    app.request(HOST + path, {
      method,
      headers: { "content-type": "application/json", cookie: await sessionCookie(env, id, HOST) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, env);
  return { DB, env, call };
}

const CLOSED: Array<[string, string]> = [
  ["GET", "/api/admin/overview"], ["GET", "/api/admin/accounts"], ["GET", "/api/admin/spend"], ["POST", "/api/admin/token"],
  ["GET", "/api/admin/conversions/sales?client_id=1"], ["GET", "/api/admin/plan/board"], ["POST", "/api/admin/clients"],
  ["PUT", "/api/admin/clients/1"], ["POST", "/api/admin/clients/1/share"], ["GET", "/api/clients/1/summary"], ["GET", "/api/report/1"],
  ["GET", "/api/approvals"], ["GET", "/api/shopee/status?client_id=1"], ["GET", "/api/jubelio/status"], ["GET", "/api/notion/status"],
  ["GET", "/api/share/x"], ["POST", "/api/sheet-sync/x"],
];

test("agency routes are 404 in CRM mode, even for an Owner", async () => {
  const { call } = await setup("crm");
  for (const [method, path] of CLOSED) {
    const res = await call(1, method, path, method === "GET" ? undefined : {});
    assert.equal(res.status, 404, `${method} ${path}`);
  }
});

test("CRM, team and health routes still answer", async () => {
  const { call, env } = await setup("crm");
  assert.equal((await call(1, "GET", "/api/admin/users")).status, 200);
  assert.equal((await call(2, "GET", "/api/admin/clients")).status, 200);
  assert.equal((await call(2, "GET", "/api/admin/users")).status, 403, "team management stays Owner-only");
  assert.equal((await call(2, "GET", "/api/crm/status")).status, 503, "gateway not configured, but the route exists");
  assert.equal((await app.request(HOST + "/api/health?deep=1", {}, env)).status, 200);
});

test("the allowlist does not open look-alike paths", () => {
  assert.equal(crmAllows("GET", "/api/crm-tasks/summary"), true);
  assert.equal(crmAllows("GET", "/api/crmx"), false);
  assert.equal(crmAllows("GET", "/api/admin/usersx"), false);
  assert.equal(crmAllows("DELETE", "/api/admin/clients"), false);
});

test("without APP_MODE nothing is closed", async () => {
  const { call } = await setup();
  assert.notEqual((await call(1, "GET", "/api/admin/overview")).status, 404);
});

test("the CRM-mode cron runs the inbox sync only", async () => {
  const { DB, env } = await setup("crm");
  const work: Promise<unknown>[] = [];
  scheduled({ scheduledTime: Date.now() } as any, env, { waitUntil: (p: Promise<unknown>) => work.push(p) } as any);
  await Promise.all(work);
  const rows = await DB.prepare("SELECT key FROM app_settings WHERE key LIKE 'cron:%' ORDER BY key").all<{ key: string }>();
  assert.deepEqual(rows.results.map((r) => r.key), ["cron:inbox"]);
});

test("only Owner and CRM staff exist, and CRM staff get the business automatically", async () => {
  const { call, DB } = await setup("crm");
  for (const body of [{ audience: "client", client_role: "viewer", client_id: 1 }, { audience: "team", staff_role: "ads", client_ids: [1] }, { audience: "team", staff_role: "content", client_ids: [1] }]) {
    assert.equal((await call(1, "POST", "/api/admin/invites", body)).status, 400);
  }
  assert.equal((await call(1, "POST", "/api/admin/invites", { audience: "team", staff_role: "crm" })).status, 200);
  const invite = await DB.prepare("SELECT client_ids_json FROM invites").first<{ client_ids_json: string }>();
  assert.equal(invite!.client_ids_json, "[1]");
  assert.equal((await call(1, "PUT", "/api/admin/users/2", { staff_role: "ads", client_ids: [1] })).status, 400);
  assert.equal((await call(1, "PUT", "/api/admin/users/2", { staff_role: "crm" })).status, 200);
  const rows = await DB.prepare("SELECT client_id FROM user_clients WHERE user_id=2").all<{ client_id: number }>();
  assert.deepEqual(rows.results.map((r) => r.client_id), [1]);
});

test("the CRM copy offers one travel field set without agency names", () => {
  const crm = presetsFor("crm");
  assert.deepEqual(crm.map((p) => p.id), ["travel"]);
  assert.doesNotMatch(JSON.stringify(crm), /musafar|nuralive/i);
  assert.deepEqual(crm[0].fields, presetsFor().find((p) => p.id === "musafar")!.fields);
});

test("accepting an invite for a role the CRM copy does not have is refused", async () => {
  const { DB, env } = await setup("crm");
  await DB.prepare(
    `INSERT INTO invites (token, role, staff_role, client_role, client_id, client_ids_json) VALUES
     ('t-ads','admin','ads',NULL,NULL,'[1]'), ('t-content','admin','content',NULL,NULL,'[1]'), ('t-client','client',NULL,'viewer',1,NULL)`
  ).run();
  for (const token of ["t-ads", "t-content", "t-client"]) {
    const res = await app.request(`${HOST}/api/auth/invites/${token}/accept`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New", email: `${token}@x.test`, password: "long-enough-password" }),
    }, env);
    assert.equal(res.status, 400, token);
  }
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM users").first<{ n: number }>())!.n, 2);
});

test("a CRM staff invite can still be accepted", async () => {
  const { DB, env } = await setup("crm");
  await DB.prepare("INSERT INTO invites (token, role, staff_role, client_ids_json) VALUES ('t-crm','admin','crm','[1]')").run();
  const res = await app.request(`${HOST}/api/auth/invites/t-crm/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New", email: "new@x.test", password: "long-enough-password" }),
  }, env);
  assert.equal(res.status, 200);
});

test("client accounts cannot be edited in the CRM copy", async () => {
  const { DB, call } = await setup("crm");
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,client_id,client_role) VALUES (3,'c@x.test','h','Cli','client',1,'viewer')").run();
  const res = await call(1, "PUT", "/api/admin/users/3", { staff_role: "crm", client_role: "approver" });
  assert.equal(res.status, 400);
  assert.equal((await DB.prepare("SELECT client_role FROM users WHERE id=3").first<{ client_role: string }>())!.client_role, "viewer");
});
