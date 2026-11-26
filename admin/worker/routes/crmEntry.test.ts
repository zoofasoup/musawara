// The CRM copy's front door: it only works with APP_MODE exactly "crm", and splits API calls from static files.
import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import entry from "../crmEntry.ts";

const HOST = "https://toko.crm.test";
const makeEnv = (mode?: string) => {
  const assets: string[] = [];
  const env: any = {
    DB: makeDb(), JWT_SECRET: "test-secret", APP_MODE: mode,
    ASSETS: { fetch: async (r: Request) => { assets.push(new URL(r.url).pathname); return new Response("page"); } },
  };
  return { env, assets };
};
const ctx = () => {
  const work: Promise<unknown>[] = [];
  return { work, ctx: { waitUntil: (p: Promise<unknown>) => work.push(p), passThroughOnException() {} } as any };
};

test("a missing or mistyped APP_MODE answers 503 to everything", async () => {
  for (const mode of [undefined, "", "CRM", "crm ", "platform"]) {
    const { env, assets } = makeEnv(mode);
    for (const path of ["/api/health", "/api/admin/overview", "/crm/inbox"]) {
      const res = await entry.fetch(new Request(HOST + path), env, ctx().ctx);
      assert.equal(res.status, 503, `${JSON.stringify(mode)} ${path}`);
      assert.equal(await res.text(), "Misconfigured");
    }
    assert.deepEqual(assets, []);
  }
});

test("API calls go to the hardened API, everything else to the static files", async () => {
  const { env, assets } = makeEnv("crm");
  const health = await entry.fetch(new Request(HOST + "/api/health"), env, ctx().ctx);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(assets, []);
  const page = await entry.fetch(new Request(HOST + "/crm/inbox"), env, ctx().ctx);
  assert.equal(await page.text(), "page");
  assert.deepEqual(assets, ["/crm/inbox"]);
});

test("with a mistyped APP_MODE the schedule logs one line and runs nothing", async (t) => {
  const lines: unknown[] = [];
  t.mock.method(console, "error", (line: unknown) => void lines.push(line));
  const { env } = makeEnv("CRM");
  const { work, ctx: c } = ctx();
  entry.scheduled({ scheduledTime: Date.now() } as any, env, c);
  assert.equal(work.length, 0);
  assert.equal(lines.length, 1);
  assert.match(String(lines[0]), /misconfigured/);
});

test("with APP_MODE=crm the schedule runs the inbox sync", async () => {
  const { env } = makeEnv("crm");
  const { work, ctx: c } = ctx();
  entry.scheduled({ scheduledTime: Date.now() } as any, env, c);
  assert.equal(work.length, 1);
  await Promise.all(work);
});
