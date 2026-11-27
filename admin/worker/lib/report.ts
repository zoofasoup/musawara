// Client report: the pure part. Period maths, percentage change, section flags, ranking,
// organic and sales summaries and the plain-language sentences. No database access here,
// so every function can be tested with `node --test` (the queries live in routes/report.ts).
// Only `import type` is used: node's test runner cannot resolve the extensionless imports
// of the other lib files.

import type { EntityRow, Totals, TrendBucket } from "./metrics";

// ---------------------------------------------------------------------------------- dates

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !YMD.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Days in the range, both ends included. */
export function rangeDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** The whole calendar month before the one `today` is in. */
export function lastFullMonth(today: string): { from: string; to: string } {
  const to = addDays(today.slice(0, 8) + "01", -1);
  return { from: to.slice(0, 8) + "01", to };
}

function isFullMonth(from: string, to: string): boolean {
  return from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && addDays(to, 1).endsWith("-01");
}

/**
 * Period to compare with. A whole calendar month is compared with the whole month before it
 * (March with February, not with "the 28 days before"); any other range with the equal-length
 * range immediately before it, like the dashboard.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isFullMonth(from, to)) return lastFullMonth(from);
  const len = rangeDays(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export const MAX_REPORT_DAYS = 400;

export type ResolvedRange = { from: string; to: string; prevFrom: string; prevTo: string; customComparison: boolean };

/**
 * Period and comparison period from the query string. Both `from` and `to`, or neither (then the
 * last full calendar month). `compFrom`/`compTo` win when both are valid, like on the dashboard;
 * an invalid pair is ignored.
 */
export function resolveRange(
  q: { from?: string; to?: string; compFrom?: string; compTo?: string },
  today: string
): ({ ok: true } & ResolvedRange) | { ok: false; error: string } {
  let from = q.from || undefined;
  let to = q.to || undefined;
  if (!from && !to) ({ from, to } = lastFullMonth(today));
  if (!from || !to) return { ok: false, error: "Give both from and to, or neither" };
  if (!isYmd(from) || !isYmd(to)) return { ok: false, error: "Dates must be written YYYY-MM-DD" };
  if (from > to) return { ok: false, error: "from must not be after to" };
  if (rangeDays(from, to) > MAX_REPORT_DAYS) return { ok: false, error: `A report covers at most ${MAX_REPORT_DAYS} days` };
  const cf = q.compFrom, ct = q.compTo;
  if (cf && ct && isYmd(cf) && isYmd(ct) && cf <= ct && rangeDays(cf, ct) <= 1200) {
    return { ok: true, from, to, prevFrom: cf, prevTo: ct, customComparison: true };
  }
  const prev = previousPeriod(from, to);
  return { ok: true, from, to, prevFrom: prev.from, prevTo: prev.to, customComparison: false };
}

// ------------------------------------------------------------------------------ percentages

/**
 * Change from `prev` to `cur` in percent. null when it cannot be said honestly: either value
 * missing, or a previous value of zero (a rise "from nothing" has no percentage).
 */
export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function changes<K extends string>(cur: Record<K, number | null>, prev: Record<K, number | null>, keys: readonly K[]): Record<K, number | null> {
  return Object.fromEntries(keys.map((k) => [k, pctChange(cur[k], prev[k])])) as Record<K, number | null>;
}

// ------------------------------------------------------------------------------ ads

export const AD_KEYS = ["spend", "impressions", "reach", "link_clicks", "results", "cpr", "ctr", "cpm", "frequency"] as const;
export type AdKey = (typeof AD_KEYS)[number];
export type AdNumbers = Record<AdKey, number | null>;

export function adNumbers(t: Totals): AdNumbers {
  return Object.fromEntries(AD_KEYS.map((k) => [k, t[k]])) as AdNumbers;
}

/** Ads data exists in the period when something was spent or shown. */
export function adsHasData(t: Pick<Totals, "spend" | "impressions">): boolean {
  return t.spend > 0 || t.impressions > 0;
}

export type RankedEntity = {
  entity_id: string;
  name: string | null;
  thumbnail_url: string | null;
  spend: number;
  results: number;
  cpr: number | null;
  reach: number;
  previous: { spend: number; results: number; cpr: number | null };
};

/**
 * Best `n` rows by the client's primary result (ties: more spend first). When nothing in the
 * period produced a result (awareness campaigns) the ranking falls back to spend, and says so.
 */
export function topByResult(rows: EntityRow[], n: number): { rankedBy: "results" | "spend"; items: RankedEntity[] } {
  const live = rows.filter((r) => r.spend > 0 || r.results > 0);
  const anyResult = live.some((r) => r.results > 0);
  const sorted = [...live].sort((a, b) => (anyResult ? b.results - a.results || b.spend - a.spend : b.spend - a.spend));
  return {
    rankedBy: anyResult ? "results" : "spend",
    items: sorted.slice(0, n).map((r) => ({
      entity_id: r.entity_id,
      name: r.name,
      thumbnail_url: r.thumbnail_url,
      spend: r.spend,
      results: r.results,
      cpr: r.cpr,
      reach: r.reach,
      previous: { spend: r.previous.spend, results: r.previous.results, cpr: r.previous.cpr },
    })),
  };
}

export type TrendPoint = { date: string; spend: number; results: number; cpr: number | null; reach: number };
export function trendPoints(days: Array<Totals & { date: string }>): TrendPoint[] {
  return days.map((d) => ({ date: d.date, spend: d.spend, results: d.results, cpr: d.cpr, reach: d.reach }));
}

// ------------------------------------------------------------------------------ organic

export type OrganicPost = {
  media_id: string;
  format: string;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  day: string;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  interactions: number | null;
};

const ORGANIC_SUM_KEYS = ["reach", "views", "interactions", "likes", "comments", "saves", "shares"] as const;
type OrganicSumKey = (typeof ORGANIC_SUM_KEYS)[number];

/** Sum of a metric over the posts that have it; null when no post has it (unknown, not zero). */
function sumKnown(posts: OrganicPost[], key: OrganicSumKey): number | null {
  const known = posts.filter((p) => p[key] != null);
  return known.length ? known.reduce((s, p) => s + (p[key] as number), 0) : null;
}

export type OrganicSummary = {
  posts: number;
  stories: number;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  /** posts that already have insights (reach); fresh posts may still be waiting for theirs */
  posts_with_insights: number;
};

export function organicTotals(posts: OrganicPost[], stories: number): OrganicSummary {
  return {
    posts: posts.length,
    stories,
    ...(Object.fromEntries(ORGANIC_SUM_KEYS.map((k) => [k, sumKnown(posts, k)])) as Record<OrganicSumKey, number | null>),
    posts_with_insights: posts.filter((p) => p.reach != null).length,
  };
}

export function topPosts(posts: OrganicPost[], n: number): OrganicPost[] {
  return [...posts]
    .filter((p) => p.reach != null)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0) || (b.interactions ?? 0) - (a.interactions ?? 0))
    .slice(0, n)
    .map((p) => ({ ...p, caption: p.caption ? p.caption.replace(/\s+/g, " ").trim().slice(0, 140) : null }));
}

// ------------------------------------------------------------------------------ sales

export type SaleRow = { sale_date: string; value: number; source: string | null; package_name: string | null; pay_status: string | null };

export type Slice = { key: string; count: number; revenue: number };
export type SalesSummary = {
  /** sales that count: cancelled ones are left out, as on the dashboard */
  count: number;
  revenue: number;
  average: number | null;
  cancelled: number;
  by_status: Slice[];
  by_source: Slice[];
  by_package: Slice[];
};

function slices(rows: SaleRow[], keyOf: (r: SaleRow) => string | null, fallback: string, max: number): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of rows) {
    const raw = keyOf(r)?.trim() || fallback;
    const id = raw.toLowerCase();
    const cur = map.get(id) ?? { key: raw, count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += r.value;
    map.set(id, cur);
  }
  const all = [...map.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue);
  if (all.length <= max) return all;
  const rest = all.slice(max - 1).reduce((s, x) => ({ key: "Other", count: s.count + x.count, revenue: s.revenue + x.revenue }), { key: "Other", count: 0, revenue: 0 });
  return [...all.slice(0, max - 1), rest];
}

export function summarizeSales(rows: SaleRow[]): SalesSummary {
  const live = rows.filter((r) => r.pay_status !== "cancelled");
  const revenue = live.reduce((s, r) => s + r.value, 0);
  return {
    count: live.length,
    revenue,
    average: live.length ? revenue / live.length : null,
    cancelled: rows.length - live.length,
    by_status: slices(live, (r) => r.pay_status, "unknown", 6),
    by_source: slices(live, (r) => r.source, "Not recorded", 6),
    by_package: slices(live, (r) => r.package_name, "Not recorded", 6),
  };
}

// ------------------------------------------------------------------------------ sections

export type SectionFlags = { ads: boolean; trend: boolean; campaigns: boolean; creatives: boolean; organic: boolean; sales: boolean };

/** Which sections have something to show; the page leaves out the rest instead of printing zeros. */
export function sectionFlags(i: {
  adsSpend: number;
  adsImpressions: number;
  trendDays: number;
  campaigns: number;
  creatives: number;
  organicPosts: number;
  organicStories: number;
  salesCount: number;
  salesCancelled: number;
}): SectionFlags & { any: boolean } {
  const ads = i.adsSpend > 0 || i.adsImpressions > 0;
  const f = {
    ads,
    trend: ads && i.trendDays > 1,
    campaigns: ads && i.campaigns > 0,
    creatives: ads && i.creatives > 0,
    organic: i.organicPosts > 0 || i.organicStories > 0,
    sales: i.salesCount > 0 || i.salesCancelled > 0,
  };
  return { ...f, any: f.ads || f.organic || f.sales };
}

// ------------------------------------------------------------------------------ sentences

const rpFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rp = (v: number) => "Rp " + rpFmt.format(Math.round(v));
const num = (v: number, d = 0) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(v);
const plural = (n: number, one: string, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;

/**
 * ", 8% lower than the previous period" for a number that moved, ", about the same as ..." for a
 * flat one, ", up from none ..." from zero, and "" when there is nothing to say.
 */
export function compareClause(cur: number | null | undefined, prev: number | null | undefined, up = "higher", down = "lower"): string {
  if (cur == null || prev == null) return "";
  if (prev === 0) return cur > 0 ? ", up from none in the previous period" : "";
  const pct = pctChange(cur, prev);
  if (pct == null) return "";
  if (Math.abs(pct) < 0.5) return ", about the same as the previous period";
  const a = Math.abs(pct);
  return `, ${num(a, a < 10 ? 1 : 0)}% ${pct > 0 ? up : down} than the previous period`;
}

const NO_PREV = " The previous period has no data, so there is nothing to compare with.";

export function adsSummary(cur: AdNumbers, prev: AdNumbers, prevHasData: boolean, resultLabel: string): string {
  const label = resultLabel.trim().toLowerCase() || "results";
  const c = (k: AdKey, up?: string, down?: string) => (prevHasData ? compareClause(cur[k], prev[k], up, down) : "");
  let s = `Spend was ${rp(cur.spend ?? 0)}${c("spend")}.`;
  const results = cur.results ?? 0;
  if (results > 0) {
    s += ` It produced ${num(results)} ${label}${cur.cpr != null ? ` at ${rp(cur.cpr)} each` : ""}${c("results")}`;
    s += cur.cpr != null && prevHasData && compareClause(cur.cpr, prev.cpr) ? `; the cost per result was ${compareClause(cur.cpr, prev.cpr).slice(2)}.` : ".";
  } else {
    s += ` It did not produce any ${label} in this period.`;
  }
  return prevHasData ? s : s + NO_PREV;
}

export function organicSummary(cur: OrganicSummary, prev: OrganicSummary, prevHasData: boolean): string {
  let s = `${plural(cur.posts, "post")} and ${plural(cur.stories, "story", "stories")} ${cur.posts + cur.stories === 1 ? "was" : "were"} published on Instagram`;
  if (prevHasData) s += compareClause(cur.posts + cur.stories, prev.posts + prev.stories, "more", "fewer");
  s += ".";
  if (cur.reach != null) {
    s += ` Posts reached ${num(cur.reach)} people in total${prevHasData ? compareClause(cur.reach, prev.reach) : ""}. This is counted per post, so one person can be counted more than once.`;
  } else if (cur.posts > 0) {
    s += " Reach is not available yet for these posts.";
  }
  return prevHasData ? s : s + NO_PREV;
}

export function salesSummary(cur: SalesSummary, prev: SalesSummary, prevHasData: boolean, adSpend: number | null): string {
  if (cur.count === 0) return `No sales were recorded in this period${cur.cancelled ? `; ${plural(cur.cancelled, "sale")} ${cur.cancelled === 1 ? "was" : "were"} cancelled` : ""}.`;
  let s = `${plural(cur.count, "sale")} worth ${rp(cur.revenue)} ${cur.count === 1 ? "was" : "were"} recorded${prevHasData ? compareClause(cur.revenue, prev.revenue) : ""}.`;
  if (adSpend != null && adSpend > 0) s += ` Counting every recorded sale, ads cost ${rp(adSpend / cur.count)} per sale.`;
  if (cur.cancelled > 0) s += ` ${plural(cur.cancelled, "sale")} cancelled and not counted.`;
  return prevHasData ? s : s + NO_PREV;
}

// ------------------------------------------------------------------------------ the document

export type ReportInput = {
  client: { id: number; name: string; logo_url: string | null; brand_color: string | null };
  resultLabel: string;
  range: ResolvedRange;
  ads: { current: Totals; previous: Totals };
  trend: { bucket: TrendBucket; days: Array<Totals & { date: string }>; compare: Array<Totals & { date: string }> };
  campaigns: EntityRow[];
  creatives: EntityRow[];
  /** null = the client has no Instagram account connected */
  organic: { accounts: Array<{ ig_username: string | null; followers: number | null }>; posts: OrganicPost[]; prevPosts: OrganicPost[]; stories: number; prevStories: number } | null;
  sales: SaleRow[];
  prevSales: SaleRow[];
  generatedAt: string;
};

export const TOP_N = 5;

export function buildReport(i: ReportInput) {
  const cur = adNumbers(i.ads.current);
  const prev = adNumbers(i.ads.previous);
  const adsPrevHas = adsHasData(i.ads.previous);

  const campaigns = topByResult(i.campaigns, TOP_N);
  const creatives = topByResult(i.creatives, TOP_N);

  const oc = i.organic ? organicTotals(i.organic.posts, i.organic.stories) : null;
  const op = i.organic ? organicTotals(i.organic.prevPosts, i.organic.prevStories) : null;
  const sc = summarizeSales(i.sales);
  const sp = summarizeSales(i.prevSales);

  const sections = sectionFlags({
    adsSpend: i.ads.current.spend,
    adsImpressions: i.ads.current.impressions,
    trendDays: i.trend.days.length,
    campaigns: campaigns.items.length,
    creatives: creatives.items.length,
    organicPosts: oc?.posts ?? 0,
    organicStories: oc?.stories ?? 0,
    salesCount: sc.count,
    salesCancelled: sc.cancelled,
  });

  const organicPrevHas = !!op && op.posts + op.stories > 0;
  const salesPrevHas = sp.count + sp.cancelled > 0;
  const adSpend = sections.ads ? i.ads.current.ad_spend : null;

  return {
    client: i.client,
    period: { from: i.range.from, to: i.range.to, days: rangeDays(i.range.from, i.range.to) },
    comparison: { from: i.range.prevFrom, to: i.range.prevTo, custom: i.range.customComparison },
    resultLabel: i.resultLabel,
    generated_at: i.generatedAt,
    sections,
    ads: sections.ads
      ? {
          current: cur,
          previous: prev,
          change: changes(cur, prev, AD_KEYS),
          previous_has_data: adsPrevHas,
          summary: adsSummary(cur, prev, adsPrevHas, i.resultLabel),
        }
      : null,
    trend: sections.trend
      ? { bucket: i.trend.bucket, days: trendPoints(i.trend.days), compare: trendPoints(i.trend.compare) }
      : null,
    campaigns: sections.campaigns ? campaigns : null,
    creatives: sections.creatives ? creatives : null,
    organic:
      sections.organic && oc && op && i.organic
        ? {
            accounts: i.organic.accounts,
            current: oc,
            previous: op,
            change: changes(
              { posts: oc.posts, stories: oc.stories, reach: oc.reach, views: oc.views, interactions: oc.interactions },
              { posts: op.posts, stories: op.stories, reach: op.reach, views: op.views, interactions: op.interactions },
              ["posts", "stories", "reach", "views", "interactions"] as const
            ),
            previous_has_data: organicPrevHas,
            top_posts: topPosts(i.organic.posts, TOP_N),
            summary: organicSummary(oc, op, organicPrevHas),
          }
        : null,
    sales: sections.sales
      ? {
          current: sc,
          previous: sp,
          change: changes(
            { count: sc.count, revenue: sc.revenue, average: sc.average },
            { count: sp.count, revenue: sp.revenue, average: sp.average },
            ["count", "revenue", "average"] as const
          ),
          previous_has_data: salesPrevHas,
          // All recorded sales over the ad spend, not only sales traced to an ad.
          vs_ads: adSpend && sc.count > 0 ? { cost_per_sale: adSpend / sc.count, roas: sc.revenue / adSpend } : null,
          summary: salesSummary(sc, sp, salesPrevHas, adSpend),
        }
      : null,
  };
}

export type ReportDoc = ReturnType<typeof buildReport>;
