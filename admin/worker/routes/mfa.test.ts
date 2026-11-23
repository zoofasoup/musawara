import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { makeDb } from "../testkit/d1.ts";
import { backfillAccounts } from "../testkit/session.ts";
import { hashPassword } from "../lib/auth.ts";
import auth from "./auth.ts";

test("staff can sign in with a password and access their session", async () => {
  const DB = makeDb();
  const hash = await hashPassword("test-password-123");
  await DB.prepare("INSERT INTO users (id,email,password_hash,name,role) VALUES (1,'staff@example.test',?,'Staff','admin')").bind(hash).run();
  await backfillAccounts(DB);
  const app = new Hono<any>();
  app.route("/api/auth", auth);
  const env = { DB, JWT_SECRET: "this-is-a-synthetic-test-secret-with-length" };
  const login = async (password: string) => app.request("https://app.musawara.id/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "staff@example.test", password }),
  }, env);
  assert.equal((await login("wrong-password")).status, 401);
  const response = await login("test-password-123");
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).user.role, "admin");
  const cookie = response.headers.getSetCookie().find((v) => /session_token=[^;]/.test(v))?.split(";")[0];
  assert.ok(cookie);
  assert.equal((await app.request("https://app.musawara.id/api/auth/me", { headers: { cookie } }, env)).status, 200);
  assert.equal((await app.request("https://app.musawara.id/api/auth/me", {}, env)).status, 401);
});
