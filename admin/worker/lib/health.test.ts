import test from "node:test";
import assert from "node:assert/strict";
import { makeDb } from "../testkit/d1.ts";
import { CRON_STALE_MINUTES, healthReport, trackCron } from "./health.ts";

const env = () => ({ DB: makeDb() }) as any;

test("a fresh database with no jobs yet is healthy", async () => {
  const h = await healthReport(env());
  assert.deepEqual(h, { ok: true, db: true, crons: {} });
});

test("a job that ran is recorded, and a failing job is recorded with its error and never throws", async () => {
  const e = env();
  await trackCron(e, "ads", async () => {});
  await trackCron(e, "notion", async () => { throw new Error("token expired"); });
  const h = await healthReport(e);
  assert.equal(h.crons.ads.ok, true);
  assert.equal(h.crons.notion.ok, false);
  assert.equal(h.crons.notion.error, "token expired");
  assert.equal(h.ok, false);
});

test("a job that went quiet is stale, and the report turns unhealthy", async () => {
  const e = env();
  await trackCron(e, "ads", async () => {});
  const later = Date.now() + (CRON_STALE_MINUTES + 5) * 60_000;
  const h = await healthReport(e, later);
  assert.equal(h.crons.ads.stale, true);
  assert.equal(h.ok, false);
  assert.equal((await healthReport(e, Date.now() + 60_000)).ok, true);
});

test("an unreachable database reports db false instead of throwing", async () => {
  const broken = { DB: { prepare: () => { throw new Error("down"); } } } as any;
  const h = await healthReport(broken);
  assert.equal(h.db, false);
  assert.equal(h.ok, false);
});
