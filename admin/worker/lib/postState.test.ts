import test from "node:test";
import assert from "node:assert/strict";
import { can, parseScheduledAt } from "./postState.ts";

const NOW = Date.parse("2026-11-11T03:00:00Z");

test("only draft, scheduled and failed posts can be edited or deleted", () => {
  for (const s of ["draft", "scheduled", "failed"] as const) {
    assert.equal(can(s, "edit"), true);
    assert.equal(can(s, "delete"), true);
  }
  for (const s of ["publishing", "published", "needs_check"] as const) {
    assert.equal(can(s, "edit"), false);
    assert.equal(can(s, "delete"), false);
  }
});

test("a valid future time becomes UTC SQL text with seconds zeroed", () => {
  assert.deepEqual(parseScheduledAt("2026-11-12T05:30:45.123Z", NOW), { ok: true, sql: "2026-11-12 05:30:00" });
  assert.deepEqual(parseScheduledAt("2026-11-12T12:30:00+07:00", NOW), { ok: true, sql: "2026-11-12 05:30:00" });
});

test("rejects missing, malformed, past and too-soon times", () => {
  assert.equal(parseScheduledAt(undefined, NOW).ok, false);
  assert.equal(parseScheduledAt("besok", NOW).ok, false);
  assert.equal(parseScheduledAt("2026-11-12 05:30", NOW).ok, false); // no zone
  assert.equal(parseScheduledAt("2026-11-10T05:30:00Z", NOW).ok, false);
  assert.equal(parseScheduledAt("2026-11-11T03:00:30Z", NOW).ok, false); // under 1 minute ahead
  assert.equal(parseScheduledAt("2026-11-11T03:02:00Z", NOW).ok, true);
});

test("rejects times more than 75 days ahead", () => {
  assert.equal(parseScheduledAt("2027-01-24T03:00:00Z", NOW).ok, true); // 74 days
  assert.equal(parseScheduledAt("2027-02-01T03:00:00Z", NOW).ok, false);
});
