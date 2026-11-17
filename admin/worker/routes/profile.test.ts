import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { makeDb } from "../testkit/d1.ts";
import auth from "./auth.ts";
import { hashPassword } from "../lib/auth.ts";

const SECRET = "test-secret";
async function setup() {
  const DB = makeDb();
  const hash = await hashPassword("old-password-1");
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role) VALUES (1,'a@x',?,'Admin','admin'),(2,'b@x',?,'Other','admin')").bind(hash, hash).run();
  const app = new Hono<any>();
  app.route("/api/auth", auth);
  const env: any = { DB, JWT_SECRET: SECRET };
  const cookie = async (id: number) => `ma_session=${await sign({ sub: id, email: "a@x", name: "Admin", role: "admin", client_id: null, exp: Math.floor(Date.now() / 1000) + 600 }, SECRET)}`;
  const call = (method: string, path: string, body?: unknown, ck?: string) =>
    app.request(`http://app.musawara.id/api/auth${path}`, { method, headers: { "content-type": "application/json", ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  return { DB, call, cookie };
}

test("profile and password need a signed-in user", async () => {
  const { call } = await setup();
  assert.equal((await call("PATCH", "/profile", { name: "X" })).status, 401);
  assert.equal((await call("POST", "/password", { current: "a", next: "bbbbbbbb" })).status, 401);
});

test("you can rename yourself, only yourself, and the session is re-issued", async () => {
  const { DB, call, cookie } = await setup();
  const r = await call("PATCH", "/profile", { name: "  Zufar  " }, await cookie(1));
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as any).user.name, "Zufar");
  assert.match(r.headers.get("set-cookie") ?? "", /ma_session=/);
  const rows = (await DB.prepare("SELECT id, name FROM users ORDER BY id").all()).results as any[];
  assert.deepEqual(rows.map((x) => x.name), ["Zufar", "Other"]);
  for (const bad of ["", "   ", "x".repeat(81), 5, null]) assert.equal((await call("PATCH", "/profile", { name: bad }, await cookie(1))).status, 400);
});

test("changing the password needs the right current password and a good new one", async () => {
  const { DB, call, cookie } = await setup();
  const ck = await cookie(1);
  assert.equal((await call("POST", "/password", { current: "wrong", next: "new-password-2" }, ck)).status, 403);
  assert.equal((await call("POST", "/password", { current: "old-password-1", next: "short" }, ck)).status, 400);
  assert.equal((await call("POST", "/password", { current: "old-password-1", next: "old-password-1" }, ck)).status, 400);
  assert.equal((await call("POST", "/password", { current: "old-password-1", next: "new-password-2" }, ck)).status, 200);
  // the new password now works to sign in, the old one does not
  const login = (password: string) => call("POST", "/login", { email: "a@x", password });
  assert.equal((await login("new-password-2")).status, 200);
  assert.equal((await login("old-password-1")).status, 401);
  // the other account's hash is untouched
  const other = await DB.prepare("SELECT password_hash FROM users WHERE id=2").first<any>();
  const mine = await DB.prepare("SELECT password_hash FROM users WHERE id=1").first<any>();
  assert.notEqual(other.password_hash, mine.password_hash);
});
