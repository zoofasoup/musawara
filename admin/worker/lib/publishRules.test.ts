import test from "node:test";
import assert from "node:assert/strict";
import { checkUpload, validatePost, type PostIn } from "./publishRules.ts";

const img = (over = {}) => ({ type: "image" as const, bytes: 1_000_000, width: 1080, height: 1350, ...over });
const vid = (over = {}) => ({ type: "video" as const, bytes: 10_000_000, width: 1080, height: 1920, durationSec: 20, ...over });
const post = (over: Partial<PostIn> = {}): PostIn => ({ kind: "feed", caption: "Halo", media: [img()], platforms: ["instagram"], ...over });

test("upload: only JPEG images and MP4/MOV videos, with size limits", () => {
  assert.deepEqual(checkUpload("image/jpeg", 1000), { ok: true, type: "image", ext: "jpg" });
  assert.deepEqual(checkUpload("video/mp4", 1000), { ok: true, type: "video", ext: "mp4" });
  assert.deepEqual(checkUpload("video/quicktime", 1000), { ok: true, type: "video", ext: "mov" });
  assert.equal(checkUpload("image/png", 1000).ok, false);
  assert.equal(checkUpload("image/jpeg", 9 * 1024 * 1024).ok, false);
  assert.equal(checkUpload("video/mp4", 101 * 1024 * 1024).ok, false);
  assert.equal(checkUpload("video/mp4", 0).ok, false);
  assert.equal(checkUpload("video/mp4", NaN).ok, false);
});

test("a valid photo post has no errors", () => {
  assert.deepEqual(validatePost(post()), []);
});

test("needs a channel and a known type", () => {
  assert.match(validatePost(post({ platforms: [] })).join(" "), /channel/i);
  assert.match(validatePost(post({ kind: "podcast" as any })).join(" "), /type/i);
});

test("instagram caption: 2200 characters and 30 hashtags", () => {
  assert.equal(validatePost(post({ caption: "a".repeat(2200) })).length, 0);
  assert.match(validatePost(post({ caption: "a".repeat(2201) })).join(" "), /2200/);
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  assert.match(validatePost(post({ caption: tags })).join(" "), /30 hashtags/);
  // Facebook alone has no such limit
  assert.equal(validatePost(post({ caption: tags, platforms: ["facebook"] })).length, 0);
});

test("feed takes exactly one photo, not a video", () => {
  assert.match(validatePost(post({ media: [] })).join(" "), /one photo/i);
  assert.match(validatePost(post({ media: [img(), img()] })).join(" "), /one photo/i);
  assert.match(validatePost(post({ media: [vid()] })).join(" "), /one photo/i);
});

test("instagram feed photos must fit 4:5 to 1.91:1", () => {
  assert.match(validatePost(post({ media: [img({ width: 1000, height: 1500 })] })).join(" "), /4:5/);
  assert.match(validatePost(post({ media: [img({ width: 2000, height: 1000 })] })).join(" "), /1.91/);
  assert.equal(validatePost(post({ media: [img({ width: 1080, height: 1080 })] })).length, 0);
  // unknown size is not an error (Meta checks it)
  assert.equal(validatePost(post({ media: [img({ width: null, height: null })] })).length, 0);
});

test("carousel: 2 to 10 items, Facebook cannot mix in video", () => {
  assert.match(validatePost(post({ kind: "carousel", media: [img()] })).join(" "), /2 to 10/);
  assert.match(validatePost(post({ kind: "carousel", media: Array.from({ length: 11 }, () => img()) })).join(" "), /2 to 10/);
  assert.equal(validatePost(post({ kind: "carousel", media: [img(), vid()] })).length, 0);
  assert.match(validatePost(post({ kind: "carousel", media: [img(), vid()], platforms: ["instagram", "facebook"] })).join(" "), /Facebook/);
});

test("reel: one video of 3 to 90 seconds", () => {
  const reel = (media: any[]) => post({ kind: "reel", media });
  assert.equal(validatePost(reel([vid()])).length, 0);
  assert.match(validatePost(reel([img()])).join(" "), /one video/i);
  assert.match(validatePost(reel([vid({ durationSec: 2 })])).join(" "), /3 and 90/);
  assert.match(validatePost(reel([vid({ durationSec: 91 })])).join(" "), /3 and 90/);
});

test("story: one photo or video, no caption, video up to 60 seconds", () => {
  const story = (media: any[], caption = "") => post({ kind: "story", caption, media });
  assert.equal(validatePost(story([img()])).length, 0);
  assert.equal(validatePost(story([vid({ durationSec: 60 })])).length, 0);
  assert.match(validatePost(story([vid({ durationSec: 61 })])).join(" "), /60/);
  assert.match(validatePost(story([img()], "teks")).join(" "), /caption/i);
  assert.match(validatePost(story([img(), img()])).join(" "), /one/i);
});
