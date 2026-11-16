import test from "node:test";
import assert from "node:assert/strict";
import { checkMove, stageFromPost, syncStage, jakartaDay, jakartaDayStartUtc, bucketByDay, monthGrid, weekStart } from "./planning.ts";

test("manual moves work between Idea, Drafting and In review in any direction", () => {
  for (const a of ["idea", "drafting", "in_review"] as const)
    for (const b of ["idea", "drafting", "in_review"] as const) {
      if (a !== b) assert.equal(checkMove(a, b, null).ok, true, `${a}->${b}`);
    }
  assert.equal(checkMove("idea", "idea", null).ok, false);
});

test("a manual move can never enter Scheduled or Published", () => {
  for (const from of ["idea", "drafting", "in_review"] as const)
    for (const to of ["scheduled", "published"] as const) assert.equal(checkMove(from, to, null).ok, false);
  assert.equal(checkMove("in_review", "scheduled", "draft").ok, false);
});

test("a card follows its Publish post: locked while the post is scheduled/publishing/published", () => {
  for (const s of ["scheduled", "publishing", "published"]) assert.equal(checkMove("scheduled", "drafting", s).ok, false);
  // a failed or draft post no longer pins the card, so it can be reworked
  assert.equal(checkMove("scheduled", "drafting", "failed").ok, true);
  assert.equal(checkMove("published", "idea", null).ok, true);
});

test("post status maps to a stage only when scheduled, publishing or published", () => {
  assert.equal(stageFromPost("scheduled"), "scheduled");
  assert.equal(stageFromPost("publishing"), "scheduled");
  assert.equal(stageFromPost("published"), "published");
  for (const s of ["draft", "failed", "needs_check", null]) assert.equal(stageFromPost(s), null);
});

test("sync only moves a card forward, never back", () => {
  assert.equal(syncStage("idea", "scheduled"), "scheduled");
  assert.equal(syncStage("in_review", "published"), "published");
  assert.equal(syncStage("scheduled", "published"), "published");
  assert.equal(syncStage("published", "scheduled"), "published"); // post rolled back: card stays
  assert.equal(syncStage("published", "failed"), "published");
  assert.equal(syncStage("drafting", "draft"), "drafting");
  assert.equal(syncStage("drafting", "failed"), "drafting");
});

test("Jakarta day bucketing crosses the UTC date line at 17:00 UTC", () => {
  assert.equal(jakartaDay("2026-11-12 16:59:00"), "2026-11-12");
  assert.equal(jakartaDay("2026-11-12 17:00:00"), "2026-11-13");
  assert.equal(jakartaDay("2026-12-31 20:00:00"), "2027-01-01");
  assert.equal(jakartaDay("2026-11-12 00:00:00"), "2026-11-12");
  assert.equal(jakartaDayStartUtc("2026-11-13"), "2026-11-12 17:00:00");
});

test("bucketByDay groups by Jakarta day and orders by time", () => {
  const m = bucketByDay([
    { id: 3, scheduled_at: "2026-11-12 18:00:00" },
    { id: 1, scheduled_at: "2026-11-12 03:00:00" },
    { id: 2, scheduled_at: "2026-11-12 16:00:00" },
  ]);
  assert.deepEqual(m.get("2026-11-12")!.map((x) => x.id), [1, 2]);
  assert.deepEqual(m.get("2026-11-13")!.map((x) => x.id), [3]);
});

test("weeks start on Monday and the month grid covers whole weeks", () => {
  assert.equal(weekStart("2026-11-15"), "2026-11-09"); // Sunday
  assert.equal(weekStart("2026-11-09"), "2026-11-09");
  const g = monthGrid("2026-11-16");
  assert.equal(g[0][0], "2026-10-26");
  assert.equal(g.at(-1)!.at(-1), "2026-12-06");
  assert.ok(g.every((w) => w.length === 7));
});
