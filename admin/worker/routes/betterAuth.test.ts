// Better Auth behind our routes: legacy passwords keep working, second factor, one-time reset links, session revocation and
// the staff-MFA enforcement flag. These are the guarantees the move from the home-made login must not lose.
import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "otplib";
import { makeDb } from "../testkit/d1.ts";
import { backfillAccounts, sessionCookie } from "../testkit/session.ts";
import { hashPassword } from "../lib/auth.ts";
import { app } from "../index.ts";

const TEAM = "https://app.musawara.id";
const PORTAL = "https://portal.musawara.id";
const PASSWORD = "correct-horse-1";

async function setup() {
  const DB = makeDb();
  const hash = await hashPassword(PASSWORD); // the same pbkdf2 format every existing account already has
  await DB.prepare("INSERT INTO clients (id,name,slug) VALUES (1,'Alpha','alpha')").run();
  await DB.prepare(
    `INSERT INTO users (id,email,password_hash,name,role,client_id,staff_role,client_role) VALUES
     (1,'owner@x.test',?,'Owner','admin',NULL,'owner',NULL), (2,'ads@x.test',?,'Ads','admin',NULL,'ads',NULL), (3,'client@x.test',?,'Client','client',1,NULL,'approver')`
  ).bind(hash, hash, hash).run();
  await backfillAccounts(DB);
  const env: any = { DB, JWT_SECRET: "test-secret-test-secret-test-secret-00" };
  let ip = 0;
  const call = async (method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string } = {}) =>
    app.request((opts.origin ?? TEAM) + path, {
      method,
      headers: { "content-type": "application/json", origin: opts.origin ?? TEAM, "cf-connecting-ip": `198.51.100.${++ip % 250}`, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }, env);
  const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
  return { DB, env, call, cookieOf };
}

test("an existing pbkdf2 password signs in, and the session carries our role data", async () => {
  const { call, cookieOf } = await setup();
  const r = await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } });
  assert.equal(r.status, 200);
  const cookie = cookieOf(r);
  assert.match(cookie, /session_token=/);
  const me = (await (await call("GET", "/api/auth/me", { cookie })).json()) as any;
  assert.equal(me.user.id, 1);
  assert.equal(typeof me.user.id, "number");
  assert.equal(me.user.staff_role, "owner");
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: "wrong-wrong-1" } })).status, 401);
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "nobody@x.test", password: PASSWORD } })).status, 401);
});

test("the session is a revocable row: sign-out ends it, and the cookie is dead afterwards", async () => {
  const { call, cookieOf, DB } = await setup();
  const cookie = cookieOf(await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: PASSWORD } }));
  assert.equal((await call("GET", "/api/auth/me", { cookie })).status, 200);
  await call("POST", "/api/auth/logout", { cookie, body: {} });
  assert.equal((await call("GET", "/api/auth/me", { cookie })).status, 401, "the old cookie no longer works");
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM session").first<any>())!.n, 0);
});

test("changing the password signs out every other device and keeps the old column in step", async () => {
  const { call, cookieOf, DB } = await setup();
  const mine = cookieOf(await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: PASSWORD } }));
  const stolen = cookieOf(await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: PASSWORD } }));
  const r = await call("POST", "/api/auth/password", { cookie: mine, body: { current: PASSWORD, next: "brand-new-pass-2" } });
  assert.equal(r.status, 200);
  assert.equal((await call("GET", "/api/auth/me", { cookie: stolen })).status, 401, "the other session is gone");
  assert.equal((await call("GET", "/api/auth/me", { cookie: cookieOf(r) || mine })).status, 200, "this device stays signed in");
  assert.equal((await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: "brand-new-pass-2" } })).status, 200);
  const row = (await DB.prepare("SELECT u.password_hash h, a.password p FROM users u JOIN account a ON a.userId=CAST(u.id AS TEXT) WHERE u.id=2").first<any>())!;
  assert.equal(row.h, row.p, "rolling back to the previous release would not revive the old password");
});

test("two-factor: set up with a code, then a password alone no longer signs in", async () => {
  const { call, cookieOf } = await setup();
  const cookie = cookieOf(await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } }));
  const en = (await (await call("POST", "/api/auth/two-factor/enable", { cookie, body: { password: PASSWORD } })).json()) as any;
  assert.ok(en.totpURI && en.backupCodes.length === 10);
  const secret = new URL(en.totpURI).searchParams.get("secret")!;
  assert.equal((await call("POST", "/api/auth/two-factor/verify-totp", { cookie, body: { code: await generate({ secret }) } })).status, 200);

  const again = await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } });
  const body = (await again.json()) as any;
  assert.equal(body.twoFactor, true);
  assert.ok(!/session_token=[^;]/.test(again.headers.getSetCookie().join(";")), "no session yet");
  const challenge = cookieOf(again);
  const done = await call("POST", "/api/auth/two-factor/verify-totp", { cookie: challenge, body: { code: await generate({ secret }) } });
  assert.equal(done.status, 200);
  assert.equal((await call("GET", "/api/auth/me", { cookie: cookieOf(done) })).status, 200);
  const bad = await call("POST", "/api/auth/two-factor/verify-totp", { cookie: challenge, body: { code: "000000" } });
  assert.equal(bad.status, 401);
});

test("an Owner can hand out a one-time reset link, and can remove someone's second factor", async () => {
  const { call, cookieOf, DB } = await setup();
  const owner = cookieOf(await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } }));
  const ads = await sessionCookie({ DB, JWT_SECRET: "test-secret-test-secret-test-secret-00" } as any, 2, TEAM);
  assert.equal((await call("POST", "/api/admin/users/3/reset-link", { cookie: ads })).status, 403, "only Owners");

  const link = (await (await call("POST", "/api/admin/users/3/reset-link", { cookie: owner })).json()) as any;
  assert.match(link.path, /^\/reset\//);
  assert.equal((await call("POST", "/api/auth/reset", { body: { token: link.token, password: "short" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/reset", { body: { token: link.token, password: "chosen-by-client-3" } })).status, 200);
  assert.equal((await call("POST", "/api/auth/reset", { body: { token: link.token, password: "second-use-attempt" } })).status, 400, "single use");
  assert.equal((await call("POST", "/api/auth/login", { origin: PORTAL, body: { email: "client@x.test", password: "chosen-by-client-3" } })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", { origin: PORTAL, body: { email: "client@x.test", password: PASSWORD } })).status, 401);

  await DB.prepare("UPDATE users SET two_factor_enabled=1 WHERE id=2").run();
  assert.equal((await call("POST", "/api/admin/users/2/reset-2fa", { cookie: owner })).status, 200);
  assert.equal((await DB.prepare("SELECT two_factor_enabled e FROM users WHERE id=2").first<any>())!.e, 0);
});

test("staff MFA enforcement: off by default; on, a team member without a second factor may only reach sign-in and enrolment", async () => {
  const { call, cookieOf, env } = await setup();
  const ads = cookieOf(await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: PASSWORD } }));
  assert.equal((await call("GET", "/api/admin/clients", { cookie: ads })).status, 200, "flag off");
  env.REQUIRE_STAFF_MFA = "true";
  const blocked = await call("GET", "/api/admin/clients", { cookie: ads });
  assert.equal(blocked.status, 403);
  assert.equal(((await blocked.json()) as any).code, "mfa_required");
  assert.equal((await call("GET", "/api/auth/me", { cookie: ads })).status, 200, "the SPA can still ask who it is");
  assert.equal((await call("POST", "/api/auth/two-factor/enable", { cookie: ads, body: { password: PASSWORD } })).status, 200, "and enrol");
  // client logins are not staff: the flag does not touch them
  const client = cookieOf(await call("POST", "/api/auth/login", { origin: PORTAL, body: { email: "client@x.test", password: PASSWORD } }));
  assert.equal((await call("GET", "/api/auth/me", { cookie: client, origin: PORTAL })).status, 200);
});

test("only the Better Auth endpoints we use are reachable, and nobody can sign themselves up", async () => {
  const { call, cookieOf } = await setup();
  assert.equal((await call("POST", "/api/auth/sign-up/email", { body: { email: "evil@x.test", password: "whatever-123", name: "Evil" } })).status, 404);
  const cookie = cookieOf(await call("POST", "/api/auth/login", { body: { email: "ads@x.test", password: PASSWORD } }));
  for (const [m, p, b] of [["POST", "/api/auth/update-user", { role: "admin" }], ["POST", "/api/auth/delete-user", {}], ["POST", "/api/auth/change-email", { newEmail: "z@x.test" }]] as const) {
    assert.equal((await call(m, p, { cookie, body: b })).status, 404, p);
  }
});

test("a backup code signs in once and is refused the second time", async () => {
  const { call, cookieOf } = await setup();
  const cookie = cookieOf(await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } }));
  const en = (await (await call("POST", "/api/auth/two-factor/enable", { cookie, body: { password: PASSWORD } })).json()) as any;
  const secret = new URL(en.totpURI).searchParams.get("secret")!;
  await call("POST", "/api/auth/two-factor/verify-totp", { cookie, body: { code: await generate({ secret }) } });
  const code = en.backupCodes[0];
  const first = await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } });
  const done = await call("POST", "/api/auth/two-factor/verify-backup-code", { cookie: cookieOf(first), body: { code } });
  assert.equal(done.status, 200);
  assert.equal((await call("GET", "/api/auth/me", { cookie: cookieOf(done) })).status, 200);
  const second = await call("POST", "/api/auth/login", { body: { email: "owner@x.test", password: PASSWORD } });
  assert.notEqual((await call("POST", "/api/auth/two-factor/verify-backup-code", { cookie: cookieOf(second), body: { code } })).status, 200, "used codes are dead");
});

test("sign-in answers a wrong password and an unknown email the same way, and takes the same time", async () => {
  const { call } = await setup();
  const time = async (email: string) => {
    const t = performance.now();
    const r = await call("POST", "/api/auth/login", { body: { email, password: "wrong-wrong-1" } });
    return { ms: performance.now() - t, status: r.status, body: await r.text() };
  };
  const known: number[] = [], unknown: number[] = [];
  let a: any, b: any;
  for (let i = 0; i < 6; i++) { a = await time("owner@x.test"); b = await time("nobody@x.test"); known.push(a.ms); unknown.push(b.ms); }
  assert.deepEqual([a.status, a.body], [b.status, b.body]);
  const med = (x: number[]) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
  assert.ok(Math.abs(med(known) - med(unknown)) < Math.max(med(known), med(unknown)) * 0.6, `known ${med(known)}ms vs unknown ${med(unknown)}ms`);
});

test("a right password on the wrong host says where to sign in, and creates no session", async () => {
  const { call, DB } = await setup();
  const r = await call("POST", "/api/auth/login", { origin: PORTAL, body: { email: "owner@x.test", password: PASSWORD } });
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as any).code, "wrong_host");
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM session").first<any>())!.n, 0);
});
