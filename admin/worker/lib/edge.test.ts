import test from "node:test";
import assert from "node:assert/strict";
import { serveApi } from "./edge.ts";

const ok = { fetch: () => Response.json({ ok: true }) };
const ctx: any = { waitUntil() {} };
const post = (path: string, origin?: string) => new Request("https://toko.crm.test" + path, { method: "POST", headers: origin ? { origin } : {} });
const limiter = (success: boolean): any => ({ AUTH_LIMITER: { limit: async () => ({ success }) } });

test("a foreign origin cannot write", async () => {
  assert.equal((await serveApi(post("/api/pipeline", "https://evil.test"), limiter(true), ctx, ok)).status, 403);
});

test("sign-in is rate limited and refuses to run without the limiter", async () => {
  assert.equal((await serveApi(post("/api/auth/login"), {}, ctx, ok)).status, 503);
  const blocked = await serveApi(post("/api/auth/login"), limiter(false), ctx, ok);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "60");
});

test("answers carry the private headers", async () => {
  const res = await serveApi(post("/api/pipeline"), limiter(true), ctx, ok);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});
