import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { makeDb } from "../testkit/d1.ts";
import { hashPassword } from "../lib/auth.ts";
import auth from "./auth.ts";

const SECRET = "test-secret";
const PASSWORD = "correct-horse-1";

async function setup() {
  const DB = makeDb();
  await DB.exec(`CREATE TRIGGER test_admin_mfa AFTER INSERT ON users WHEN NEW.role='admin'
    BEGIN INSERT INTO staff_mfa (user_id, secret_enc, confirmed, version) VALUES (NEW.id, 'test', 1, 1); END;`);
  const hash = await hashPassword(PASSWORD);
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Alpha','alpha')").run();
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role,client_id,staff_role,client_role) VALUES (1,'team@x',?,'Team','admin',NULL,'owner',NULL),(2,'client@x',?,'Client','client',1,NULL,'approver')")
    .bind(hash, hash)
    .run();
  await DB.prepare("INSERT INTO invites (id,token,email,role,client_role,staff_role,client_id,used) VALUES (1,'inv-client','new@x','client','approver',NULL,1,0),(2,'inv-team','mate@x','admin',NULL,'owner',NULL,0)").run();
  const app = new Hono<any>();
  app.route("/api/auth", auth);
  const env: any = { DB, JWT_SECRET: SECRET };
  const call = (method: string, url: string, opts: { body?: unknown; cookie?: string } = {}) =>
    app.request(url, {
      method,
      headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }, env);
  const cookie = async (role: string, client_id: number | null) =>
    `ma_session=${await sign({ sub: role === "admin" ? 1 : 2, email: "e", name: "n", role, client_id, mfa_version: 1, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
  return { DB, call, cookie };
}

const TEAM = "https://app.musawara.id";
const CLIENT = "https://portal.musawara.id";
const OPEN = "https://musawara.id";

test("login: each role signs in only on its own host, and no cookie is set otherwise", async () => {
  const { call } = await setup();
  const team = { email: "team@x", password: PASSWORD };
  const client = { email: "client@x", password: PASSWORD };

  const ok1 = await call("POST", `${TEAM}/api/auth/login`, { body: team });
  assert.equal(ok1.status, 200);
  assert.ok(ok1.headers.get("set-cookie"));
  assert.equal((await call("POST", `${CLIENT}/api/auth/login`, { body: client })).status, 200);

  const bad1 = await call("POST", `${TEAM}/api/auth/login`, { body: client });
  assert.equal(bad1.status, 403);
  assert.equal(bad1.headers.get("set-cookie"), null);
  const body: any = await bad1.json();
  assert.equal(body.code, "wrong_host");
  assert.match(body.error, /portal\.musawara\.id/);

  const bad2 = await call("POST", `${CLIENT}/api/auth/login`, { body: team });
  assert.equal(bad2.status, 403);
  assert.equal(bad2.headers.get("set-cookie"), null);
  assert.match(((await bad2.json()) as any).error, /app\.musawara\.id/);

  // other hosts keep serving everyone
  assert.equal((await call("POST", `${OPEN}/api/auth/login`, { body: team })).status, 200);
  assert.equal((await call("POST", `${OPEN}/api/auth/login`, { body: client })).status, 200);
});

test("a wrong password is still a 401, never a host hint", async () => {
  const { call } = await setup();
  const r = await call("POST", `${TEAM}/api/auth/login`, { body: { email: "client@x", password: "nope-nope-1" } });
  assert.equal(r.status, 401);
});

test("an existing session is ignored on the other audience's host", async () => {
  const { call, cookie } = await setup();
  const teamCookie = await cookie("admin", null);
  const clientCookie = await cookie("client", 1);
  assert.equal((await call("GET", `${TEAM}/api/auth/me`, { cookie: teamCookie })).status, 200);
  assert.equal((await call("GET", `${CLIENT}/api/auth/me`, { cookie: clientCookie })).status, 200);
  assert.equal((await call("GET", `${TEAM}/api/auth/me`, { cookie: clientCookie })).status, 401);
  assert.equal((await call("GET", `${CLIENT}/api/auth/me`, { cookie: teamCookie })).status, 401);
  assert.equal((await call("GET", `${OPEN}/api/auth/me`, { cookie: teamCookie })).status, 200);
  assert.equal((await call("GET", `${OPEN}/api/auth/me`, { cookie: clientCookie })).status, 200);
});

test("invites: accepted only on the invitee's host, and a refusal leaves the invite unused", async () => {
  const { DB, call } = await setup();
  const accept = (host: string, token: string, email: string) =>
    call("POST", `${host}/api/auth/invites/${token}/accept`, { body: { name: "N", email, password: "a-long-password-1" } });

  const refused = await accept(TEAM, "inv-client", "new@x");
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get("set-cookie"), null);
  assert.equal((await DB.prepare("SELECT used FROM invites WHERE token='inv-client'").first<any>()).used, 0);
  assert.equal(await DB.prepare("SELECT id FROM users WHERE email='new@x'").first(), null);

  assert.equal((await accept(CLIENT, "inv-client", "new@x")).status, 200);
  assert.equal((await accept(CLIENT, "inv-team", "mate@x")).status, 403);
  assert.equal((await accept(TEAM, "inv-team", "mate@x")).status, 200);
});

test("bootstrap requires an operator credential and creates only the first admin", async () => {
  const DB = makeDb();
  const app = new Hono<any>();
  app.route("/api/auth", auth);
  const token = "local-test-operator-token-at-least-32-characters";
  const env = { DB, JWT_SECRET: SECRET, ADMIN_BOOTSTRAP_TOKEN: token };
  const bootstrap = (host: string, email: string, authorized = true) => app.request(`${host}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorized && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ email, password: PASSWORD }),
  }, env);

  assert.equal((await bootstrap(TEAM, "first@example.test", false)).status, 404);
  assert.equal((await bootstrap(CLIENT, "first@example.test")).status, 404);
  const results = await Promise.all([
    bootstrap(TEAM, "first@example.test"),
    bootstrap(TEAM, "second@example.test"),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 403]);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>())?.count, 1);
});

test("removing an account revokes its existing session", async () => {
  const { DB, call, cookie } = await setup();
  const session = await cookie("client", 1);
  assert.equal((await call("GET", `${CLIENT}/api/auth/me`, { cookie: session })).status, 200);
  await DB.prepare("DELETE FROM users WHERE id=2").run();
  assert.equal((await call("GET", `${CLIENT}/api/auth/me`, { cookie: session })).status, 401);
});


test("an invitation creates at most one account", async () => {
  const { DB, call } = await setup();
  await DB.prepare("UPDATE invites SET email=NULL WHERE token='inv-client'").run();
  const accept = (email: string) =>
    call("POST", `${CLIENT}/api/auth/invites/inv-client/accept`, {
      body: { name: "New user", email, password: PASSWORD },
    });
  const results = await Promise.all([accept("first@x.test"), accept("second@x.test")]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 404]);
  const matching = await DB.prepare("SELECT COUNT(*) AS count FROM users WHERE email IN ('first@x.test','second@x.test')")
    .first<{ count: number }>();
  assert.equal(matching?.count, 1);
});
