import test from "node:test";
import assert from "node:assert/strict";
import { buildCreatives, type CreativeRaw } from "./creative.ts";

let n = 0;
const ad = (o: Partial<CreativeRaw>): CreativeRaw => ({
  entity_id: `a${++n}`, name: "ad", thumbnail_url: null, status: "ACTIVE", effective_status: "ACTIVE",
  spend: 1_000_000, impressions: 50_000, reach: 25_000, link_clicks: 500, leads: 10,
  views3s: 0, thruplays: 0, plays: 0, watch_weighted: 0, days_active: 7, first_date: "2026-11-01",
  quality: null, engagement: null, conversion: null, ...o,
});
const verdicts = (raws: CreativeRaw[]) => Object.fromEntries(buildCreatives(raws).map((c) => [c.entity_id, c.verdict]));

test("rates: hook, hold, link ctr, watch time", () => {
  const [c] = buildCreatives([ad({ views3s: 10_000, thruplays: 2_500, plays: 20_000, watch_weighted: 100_000, link_clicks: 250, impressions: 50_000 })]);
  assert.equal(c.hook_rate, 20);
  assert.equal(c.hold_rate, 25);
  assert.equal(c.avg_watch_s, 5);
  assert.equal(c.link_ctr, 0.5);
  assert.equal(c.cost_per_link_click, 4000);
});

test("non-video ads have no hook or hold rate", () => {
  const [c] = buildCreatives([ad({})]);
  assert.equal(c.hook_rate, null);
  assert.equal(c.hold_rate, null);
  assert.equal(c.avg_watch_s, null);
});

test("verdict compares an ad with the client's own median", () => {
  const normal = [ad({ spend: 1_000_000, leads: 10 }), ad({ spend: 1_000_000, leads: 10 }), ad({ spend: 1_000_000, leads: 10 })];
  const winner = ad({ spend: 1_000_000, leads: 20 }); // CPL half of the median
  const weak = ad({ spend: 1_000_000, leads: 0 });
  const fat = ad({ spend: 1_000_000, leads: 20, reach: 10_000, impressions: 50_000 }); // frequency 5
  const tiny = ad({ spend: 10_000, impressions: 200, leads: 0 });
  const v = verdicts([...normal, winner, weak, fat, tiny]);
  assert.equal(v[winner.entity_id], "winner");
  assert.equal(v[weak.entity_id], "weak");
  assert.equal(v[fat.entity_id], "fatigued");
  assert.equal(v[tiny.entity_id], "low_data");
  assert.equal(v[normal[0].entity_id], "ok");
});

test("a winner needs enough leads, not just a low CPL", () => {
  const base = [ad({ leads: 10 }), ad({ leads: 10 }), ad({ leads: 10 })];
  const lucky = ad({ spend: 100_000, leads: 2 }); // CPL 50k vs median 100k, but only 2 leads
  assert.equal(verdicts([...base, lucky])[lucky.entity_id], "ok");
});

test("hold rate is unknown, not 0%, when no ThruPlay data was stored", () => {
  const [c] = buildCreatives([ad({ views3s: 10_000, thruplays: 0, plays: 0 })]);
  assert.equal(c.hook_rate, 20);
  assert.equal(c.hold_rate, null);
});

test("a winner must also have spent at least the median, so tiny budgets do not top the list", () => {
  const base = [ad({ leads: 10 }), ad({ leads: 10 }), ad({ leads: 10 })];
  const cheap = ad({ spend: 200_000, leads: 6 }); // CPL 33k vs median 100k but spent far less than the median
  assert.equal(verdicts([...base, cheap])[cheap.entity_id], "ok");
});
