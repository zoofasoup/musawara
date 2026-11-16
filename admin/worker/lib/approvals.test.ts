import test from "node:test";
import assert from "node:assert/strict";
import { decide, parseIds, parseTags, resubmit, validateAsset, validateDriveUrl } from "./approvals.ts";

test("accepts https links on drive.google.com and docs.google.com", () => {
  for (const u of [
    "https://drive.google.com/file/d/abc123/view?usp=sharing",
    "https://drive.google.com/drive/folders/xyz",
    "https://docs.google.com/document/d/abc/edit",
    "  https://docs.google.com/spreadsheets/d/abc  ",
  ])
    assert.equal(validateDriveUrl(u).ok, true, u);
});

test("rejects every other scheme and host", () => {
  for (const u of [
    "http://drive.google.com/file/d/abc",
    "https://drive.google.com.evil.com/file/d/abc",
    "https://evil.com/?u=https://drive.google.com/x",
    "https://evildrive.google.com.example.org/",
    "https://sub.drive.google.com/x",
    "https://www.google.com/",
    "https://user:pw@drive.google.com/x",
    "https://drive.google.com:8443/x",
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://drive.google.com/x",
    "drive.google.com/file/d/abc",
    "",
    "   ",
    "https://drive.google.com/" + "a".repeat(2000),
  ])
    assert.equal(validateDriveUrl(u).ok, false, u);
  for (const u of [undefined, null, 42, {}, ["https://drive.google.com/x"]]) assert.equal(validateDriveUrl(u).ok, false);
});

test("tags are lower case, trimmed, unique", () => {
  assert.deepEqual(parseTags(" Reel, padel ,reel,, 11.11 "), ["reel", "padel", "11.11"]);
  assert.deepEqual(parseTags(["A", "a", 3 as any, "b,c"]), ["a"]);
  assert.deepEqual(parseTags(undefined), []);
});

test("validateAsset checks title, kind and link, and normalises tags", () => {
  const ok = validateAsset({ title: " Teaser ", kind: "video", drive_url: "https://drive.google.com/file/d/1", tags: "Reel, Padel" });
  assert.ok(ok.ok && ok.asset.title === "Teaser" && ok.asset.tags === "reel,padel");
  assert.equal(validateAsset({ title: "", drive_url: "https://drive.google.com/x" }).ok, false);
  assert.equal(validateAsset({ title: "x", kind: "gif", drive_url: "https://drive.google.com/x" }).ok, false);
  assert.equal(validateAsset({ title: "x", drive_url: "https://dropbox.com/x" }).ok, false);
  assert.equal(validateAsset(null).ok, false);
});

test("a client can decide a pending request, with a comment required for changes", () => {
  assert.deepEqual(decide("pending", "approved", ""), { ok: true, to: "approved" });
  assert.deepEqual(decide("pending", "changes_requested", "Make the logo bigger"), { ok: true, to: "changes_requested" });
  assert.equal(decide("pending", "changes_requested", "  ").ok, false);
  assert.equal(decide("pending", "changes_requested", undefined).ok, false);
  assert.equal(decide("pending", "maybe", "").ok, false);
});

test("no approving twice, and no deciding once changes are requested", () => {
  assert.equal(decide("approved", "approved", "").ok, false);
  assert.equal(decide("approved", "changes_requested", "late").ok, false);
  assert.equal(decide("changes_requested", "approved", "").ok, false);
  assert.equal(decide("changes_requested", "changes_requested", "again").ok, false);
});

test("only changes_requested can be resubmitted", () => {
  assert.deepEqual(resubmit("changes_requested"), { ok: true, to: "pending" });
  assert.equal(resubmit("pending").ok, false);
  assert.equal(resubmit("approved").ok, false);
});

test("parseIds wants distinct positive integers", () => {
  assert.deepEqual(parseIds([1, 2, 2, 3]), [1, 2, 3]);
  assert.equal(parseIds([0]), null);
  assert.equal(parseIds(["1"]), null);
  assert.equal(parseIds("1"), null);
  assert.equal(parseIds(Array.from({ length: 21 }, (_, i) => i + 1)), null);
});
