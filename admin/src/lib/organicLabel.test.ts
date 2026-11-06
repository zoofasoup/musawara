import test from "node:test";
import assert from "node:assert/strict";
import { labelPosts, type LabelPost } from "./organicLabel.ts";

const NOW = Date.parse("2026-11-07T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let n = 0;
const post = (o: Partial<LabelPost> & { daysAgo: number }): LabelPost => ({
  media_id: `m${++n}`,
  ig_user_id: "a",
  format: "reel",
  posted_at: daysAgo(o.daysAgo),
  reach: 1000,
  shares: 10,
  saves: 10,
  ...o,
});
const baseline = (count = 8, format = "reel", ig = "a") =>
  Array.from({ length: count }, (_, i) => post({ daysAgo: 5 + i, format, ig_user_id: ig }));

test("scores against the median of the same account and format", () => {
  const top = post({ daysAgo: 3, reach: 3000, shares: 30, saves: 30 });
  const weak = post({ daysAgo: 4, reach: 300, shares: 2, saves: 2 });
  const same = post({ daysAgo: 2 });
  const l = labelPosts([...baseline(), top, weak, same], NOW);
  assert.equal(l.get(top.media_id), "top");
  assert.equal(l.get(weak.media_id), "weak");
  assert.equal(l.get(same.media_id), "average");
});

test("good sits between average and top", () => {
  const p = post({ daysAgo: 3, reach: 1300, shares: 13, saves: 13 });
  assert.equal(labelPosts([...baseline(), p], NOW).get(p.media_id), "good");
});

test("posts under 48 hours are New, never Weak", () => {
  const p = post({ daysAgo: 1, reach: 10, shares: 0, saves: 0 });
  assert.equal(labelPosts([...baseline(), p], NOW).get(p.media_id), "new");
});

test("no label when fewer than 5 baseline posts of that format", () => {
  const p = post({ daysAgo: 3 });
  assert.equal(labelPosts([...baseline(4), p], NOW).get(p.media_id), null);
});

test("baseline is per format and per account", () => {
  const p = post({ daysAgo: 3, format: "carousel" });
  const l = labelPosts([...baseline(8, "reel"), ...baseline(8, "carousel", "b"), p], NOW);
  assert.equal(l.get(p.media_id), null);
});

test("post without insights yet has no label", () => {
  const p = post({ daysAgo: 3, reach: null, shares: null, saves: null });
  assert.equal(labelPosts([...baseline(), p], NOW).get(p.media_id), null);
});
