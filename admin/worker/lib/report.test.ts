import test from "node:test";
import assert from "node:assert/strict";
import {
  adsSummary,
  buildReport,
  changes,
  compareClause,
  isYmd,
  lastFullMonth,
  organicSummary,
  organicTotals,
  pctChange,
  previousPeriod,
  resolveRange,
  salesSummary,
  sectionFlags,
  summarizeSales,
  topByResult,
  topPosts,
  type AdNumbers,
  type OrganicPost,
  type SaleRow,
} from "./report.ts";

const TODAY = "2026-11-16";

test("last full calendar month, including January and leap February", () => {
  assert.deepEqual(lastFullMonth("2026-11-16"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(lastFullMonth("2026-01-03"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(lastFullMonth("2028-03-01"), { from: "2028-02-01", to: "2028-02-29" });
});

test("a whole month is compared with the whole month before, other ranges with the equal-length range before", () => {
  assert.deepEqual(previousPeriod("2026-03-01", "2026-03-31"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(previousPeriod("2026-01-01", "2026-01-31"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(previousPeriod("2026-10-08", "2026-10-14"), { from: "2026-10-01", to: "2026-10-07" });
  assert.deepEqual(previousPeriod("2026-10-01", "2026-10-15"), { from: "2026-09-16", to: "2026-09-30" });
  assert.deepEqual(previousPeriod("2026-11-05", "2026-11-05"), { from: "2026-11-04", to: "2026-11-04" });
});

test("resolveRange defaults to the last full month and validates input", () => {
  const d = resolveRange({}, TODAY);
  assert.ok(d.ok);
  assert.deepEqual([d.from, d.to, d.prevFrom, d.prevTo, d.customComparison], ["2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30", false]);

  assert.equal(resolveRange({ from: "2026-10-01" }, TODAY).ok, false); // only one end
  assert.equal(resolveRange({ from: "2026-10-31", to: "2026-10-01" }, TODAY).ok, false);
  assert.equal(resolveRange({ from: "2026-02-30", to: "2026-03-01" }, TODAY).ok, false);
  assert.equal(resolveRange({ from: "10/01/2026", to: "2026-10-31" }, TODAY).ok, false);
  assert.equal(resolveRange({ from: "2024-01-01", to: "2026-01-01" }, TODAY).ok, false); // too long
});

test("compFrom/compTo win when valid and are ignored when not", () => {
  const ok = resolveRange({ from: "2026-10-01", to: "2026-10-31", compFrom: "2025-10-01", compTo: "2025-10-31" }, TODAY);
  assert.ok(ok.ok);
  assert.deepEqual([ok.prevFrom, ok.prevTo, ok.customComparison], ["2025-10-01", "2025-10-31", true]);
  for (const bad of [{ compFrom: "2025-10-31", compTo: "2025-10-01" }, { compFrom: "2025-10-01" }, { compFrom: "x", compTo: "y" }]) {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-31", ...bad }, TODAY);
    assert.ok(r.ok);
    assert.deepEqual([r.prevFrom, r.customComparison], ["2026-09-01", false]);
  }
});

test("isYmd rejects impossible dates", () => {
  assert.equal(isYmd("2028-02-29"), true);
  assert.equal(isYmd("2026-02-29"), false);
  assert.equal(isYmd("2026-13-01"), false);
  assert.equal(isYmd(undefined), false);
});

test("percentage change handles zero and missing previous values", () => {
  assert.equal(pctChange(110, 100), 10);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(0, 100), -100);
  assert.equal(pctChange(100, 0), null); // from nothing: no percentage
  assert.equal(pctChange(0, 0), null);
  assert.equal(pctChange(100, null), null);
  assert.equal(pctChange(null, 100), null);
  assert.equal(pctChange(undefined, 100), null);
  assert.equal(pctChange(NaN, 100), null);
  assert.equal(pctChange(-50, -100), 50); // |prev| keeps the sign meaningful
  assert.deepEqual(changes({ a: 10, b: 5 }, { a: 5, b: 0 }, ["a", "b"] as const), { a: 100, b: null });
});

test("compareClause words", () => {
  assert.equal(compareClause(92, 100), ", 8% lower than the previous period");
  assert.equal(compareClause(112.34, 100), ", 12% higher than the previous period");
  assert.equal(compareClause(101.234, 100), ", 1,2% higher than the previous period"); // id-ID decimal comma, like the app
  assert.equal(compareClause(100.2, 100), ", about the same as the previous period");
  assert.equal(compareClause(5, 0), ", up from none in the previous period");
  assert.equal(compareClause(0, 0), "");
  assert.equal(compareClause(5, null), "");
  assert.equal(compareClause(120, 100, "more", "fewer"), ", 20% more than the previous period");
});

const ads = (o: Partial<AdNumbers>): AdNumbers => ({ spend: 0, impressions: 0, reach: 0, link_clicks: 0, results: 0, cpr: null, ctr: null, cpm: null, frequency: null, ...o });

test("ads summary reads the numbers and copes with missing comparison", () => {
  const s = adsSummary(ads({ spend: 9_200_000, results: 340, cpr: 27_058 }), ads({ spend: 10_000_000, results: 300, cpr: 33_333 }), true, "Chats Started");
  assert.match(s, /^Spend was Rp 9\.200\.000, 8% lower than the previous period\./);
  assert.match(s, /340 chats started at Rp 27\.058 each, 13% higher than the previous period; the cost per result was 19% lower than the previous period\.$/);

  const none = adsSummary(ads({ spend: 1_000_000, results: 0 }), ads({}), false, "Results");
  assert.match(none, /did not produce any results/);
  assert.match(none, /nothing to compare with/);
  assert.doesNotMatch(none, /%/);
});

test("section flags omit empty sections", () => {
  const base = { adsSpend: 0, adsImpressions: 0, trendDays: 0, campaigns: 0, creatives: 0, organicPosts: 0, organicStories: 0, salesCount: 0, salesCancelled: 0 };
  assert.deepEqual(sectionFlags(base), { ads: false, trend: false, campaigns: false, creatives: false, organic: false, sales: false, any: false });
  const f = sectionFlags({ ...base, adsSpend: 5, trendDays: 20, campaigns: 2, organicStories: 3 });
  assert.deepEqual([f.ads, f.trend, f.campaigns, f.creatives, f.organic, f.sales, f.any], [true, true, true, false, true, false, true]);
  // a single trend point is not a trend; ads detail never shows without ads
  assert.equal(sectionFlags({ ...base, adsSpend: 5, trendDays: 1 }).trend, false);
  assert.equal(sectionFlags({ ...base, campaigns: 3, trendDays: 9 }).campaigns, false);
  // only cancelled sales still count as sales data (the section says so)
  assert.equal(sectionFlags({ ...base, salesCancelled: 1 }).sales, true);
});

const row = (id: string, spend: number, results: number): any => ({
  entity_id: id, name: id, thumbnail_url: null, spend, results, reach: 0, cpr: results ? spend / results : null,
  previous: { spend: 0, results: 0, cpr: null },
});

test("top rows rank by results, then spend, and fall back to spend with no results", () => {
  const r = topByResult([row("a", 100, 5), row("b", 300, 5), row("c", 50, 9), row("idle", 0, 0)], 2);
  assert.equal(r.rankedBy, "results");
  assert.deepEqual(r.items.map((x) => x.entity_id), ["c", "b"]);
  const f = topByResult([row("a", 100, 0), row("b", 300, 0)], 5);
  assert.equal(f.rankedBy, "spend");
  assert.deepEqual(f.items.map((x) => x.entity_id), ["b", "a"]);
  assert.deepEqual(topByResult([row("idle", 0, 0)], 5).items, []);
});

const post = (id: string, o: Partial<OrganicPost> = {}): OrganicPost => ({
  media_id: id, format: "reel", permalink: null, caption: null, thumbnail_url: null, day: "2026-10-05",
  likes: null, comments: null, reach: null, views: null, saves: null, shares: null, interactions: null, ...o,
});

test("organic totals keep unknown apart from zero", () => {
  const t = organicTotals([post("a", { reach: 100, saves: 0 }), post("b", { reach: 50 }), post("c")], 4);
  assert.deepEqual([t.posts, t.stories, t.reach, t.saves, t.views, t.posts_with_insights], [3, 4, 150, 0, null, 2]);
  const empty = organicTotals([], 0);
  assert.deepEqual([empty.posts, empty.reach], [0, null]);
});

test("top posts: by reach, only posts with insights, caption shortened", () => {
  const long = "x ".repeat(200);
  const t = topPosts([post("a", { reach: 10 }), post("b", { reach: 90, caption: long }), post("c"), post("d", { reach: 50 })], 2);
  assert.deepEqual(t.map((p) => p.media_id), ["b", "d"]);
  assert.ok((t[0].caption ?? "").length <= 140);
});

test("organic summary says reach is counted per post", () => {
  const cur = organicTotals([post("a", { reach: 1000 })], 10);
  const prev = organicTotals([post("p", { reach: 800 }), post("q", { reach: 200 })], 5);
  const s = organicSummary(cur, prev, true);
  assert.match(s, /^1 post and 10 stories were published on Instagram, 57% more than the previous period\./);
  assert.match(s, /counted per post/);
  const none = organicSummary(organicTotals([post("a")], 0), organicTotals([], 0), false);
  assert.match(none, /Reach is not available yet/);
});

const sale = (value: number, o: Partial<SaleRow> = {}): SaleRow => ({ sale_date: "2026-10-03", value, source: null, package_name: null, pay_status: null, ...o });

test("sales summary: cancelled are not counted, sources merge case-insensitively, long tails fold into Other", () => {
  const rows = [
    sale(30_000_000, { source: "Instagram", pay_status: "paid" }),
    sale(20_000_000, { source: "instagram ", pay_status: "dp" }),
    sale(10_000_000, { source: "Referral" }),
    sale(99_000_000, { source: "Instagram", pay_status: "cancelled" }),
  ];
  const s = summarizeSales(rows);
  assert.deepEqual([s.count, s.revenue, s.average, s.cancelled], [3, 60_000_000, 20_000_000, 1]);
  assert.deepEqual(s.by_source.map((x) => [x.key, x.count]), [["Instagram", 2], ["Referral", 1]]);
  assert.deepEqual(s.by_status.map((x) => x.key).sort(), ["dp", "paid", "unknown"]);
  assert.equal(summarizeSales([]).average, null);

  const many = summarizeSales(Array.from({ length: 9 }, (_, i) => sale(1, { source: `s${i}` })));
  assert.equal(many.by_source.length, 6);
  assert.deepEqual([many.by_source[5].key, many.by_source[5].count], ["Other", 4]);
});

test("sales summary sentence", () => {
  const cur = summarizeSales([sale(30_000_000), sale(10_000_000)]);
  const prev = summarizeSales([sale(80_000_000)]);
  assert.equal(
    salesSummary(cur, prev, true, 8_000_000),
    "2 sales worth Rp 40.000.000 were recorded, 50% lower than the previous period. Counting every recorded sale, ads cost Rp 4.000.000 per sale."
  );
  assert.match(salesSummary(summarizeSales([]), prev, true, null), /^No sales were recorded/);
  assert.match(salesSummary(cur, summarizeSales([]), false, null), /nothing to compare with/);
});

const totals = (o: any): any => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, leads: 0, purchases: 0, purchase_value: 0, purchases_sent: 0, ctr: null, cpm: null, cpr: null, cpl: null, cpa: null, roas: null, frequency: null, ...o });

test("buildReport leaves out sections without data and keeps the comparison honest", () => {
  const range: any = { from: "2026-10-01", to: "2026-10-31", prevFrom: "2026-09-01", prevTo: "2026-09-30", customComparison: false };
  const r = buildReport({
    client: { id: 1, name: "Acme", logo_url: null, brand_color: null },
    resultLabel: "Results",
    range,
    ads: { current: totals({}), previous: totals({}) },
    trend: { bucket: "day", days: [], compare: [] },
    campaigns: [],
    creatives: [],
    organic: null,
    sales: [],
    prevSales: [],
    generatedAt: "2026-11-16T00:00:00Z",
  });
  assert.equal(r.sections.any, false);
  assert.deepEqual([r.ads, r.trend, r.campaigns, r.creatives, r.organic, r.sales], [null, null, null, null, null, null]);
  assert.equal(r.period.days, 31);

  const full = buildReport({
    client: { id: 1, name: "Acme", logo_url: null, brand_color: null },
    resultLabel: "Leads",
    range,
    ads: { current: totals({ spend: 1000, impressions: 10, results: 2, cpr: 500 }), previous: totals({}) },
    trend: { bucket: "day", days: [{ ...totals({ spend: 500 }), date: "2026-10-01" }, { ...totals({ spend: 500 }), date: "2026-10-02" }], compare: [] },
    campaigns: [row("c1", 1000, 2)],
    creatives: [],
    organic: { accounts: [], posts: [], prevPosts: [], stories: 0, prevStories: 0 },
    sales: [sale(5000)],
    prevSales: [],
    generatedAt: "x",
  });
  assert.deepEqual([full.sections.ads, full.sections.trend, full.sections.campaigns, full.sections.creatives, full.sections.organic, full.sections.sales], [true, true, true, false, false, true]);
  assert.equal(full.ads!.change.spend, null); // previous spend was zero
  assert.equal(full.ads!.previous_has_data, false);
  assert.match(full.ads!.summary, /nothing to compare with/);
  assert.equal(full.sales!.vs_ads!.cost_per_sale, 1000);
  assert.equal(full.sales!.vs_ads!.roas, 5);
});
