// Shared aggregation queries for the dashboard endpoints. All ratios are derived
// from summed raw values (Ads Manager definitions): CTR = clicks/impressions,
// CPM = spend/impressions*1000, CPR = spend/results, frequency = impressions/reach.
// Range "reach" is approximated by summing daily reach (true deduped range reach
// isn't derivable from daily rows) — documented assumption.

import type { Env } from "../types";
import { buildCreatives, type CreativeRaw } from "./creative";

export type Totals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  results: number;
  leads: number; // messaging conversations started
  purchases: number;
  purchase_value: number;
  purchases_sent: number; // of the purchases, how many reached Meta
  ctr: number | null;
  cpm: number | null;
  cpr: number | null;
  cpl: number | null; // cost per lead
  cpa: number | null; // spend / purchases (purchases = uploaded offline sales)
  roas: number | null; // purchase value / spend
  frequency: number | null;
};

type RawSums = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  link_clicks: number | null;
  results: number | null;
  leads: number | null;
  purchases: number | null;
  purchase_value: number | null;
  purchases_sent?: number | null;
};

export function finalize(r: RawSums | null | undefined): Totals {
  const spend = r?.spend ?? 0;
  const impressions = r?.impressions ?? 0;
  const reach = r?.reach ?? 0;
  const clicks = r?.clicks ?? 0;
  const results = r?.results ?? 0;
  const leads = r?.leads ?? 0;
  const purchase_value = r?.purchase_value ?? 0;
  return {
    spend,
    impressions,
    reach,
    clicks,
    link_clicks: r?.link_clicks ?? 0,
    results,
    leads,
    purchases: r?.purchases ?? 0,
    purchase_value,
    purchases_sent: r?.purchases_sent ?? 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    cpr: results > 0 ? spend / results : null,
    cpl: leads > 0 ? spend / leads : null,
    cpa: (r?.purchases ?? 0) > 0 ? spend / (r!.purchases as number) : null,
    roas: spend > 0 && purchase_value > 0 ? purchase_value / spend : null,
    frequency: reach > 0 ? impressions / reach : null,
  };
}

const SUM_COLS = `SUM(spend) spend, SUM(impressions) impressions, SUM(reach) reach,
  SUM(clicks) clicks, SUM(link_clicks) link_clicks, SUM(COALESCE(results,0)) results,
  SUM(leads) leads, SUM(purchases) purchases, SUM(purchase_value) purchase_value`;

/**
 * Real sales for a client in a date range, from the dashboard_sales view (uploaded or sheet-synced sales, one row per traveller,
 * whether or not it reached Meta; or paid Jubelio orders for a brand that uses Jubelio). Meta's own "purchase" actions are
 * deliberately not used: they are unreliable here.
 */
export async function offlineSales(
  env: Env,
  clientId: number,
  from: string,
  to: string
): Promise<{ purchases: number; purchase_value: number; purchases_sent: number }> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(value), 0) v, COALESCE(SUM(meta_state='sent'), 0) s
     FROM dashboard_sales WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled'`
  )
    .bind(clientId, from, to)
    .first<{ n: number; v: number; s: number }>();
  return { purchases: r?.n ?? 0, purchase_value: r?.v ?? 0, purchases_sent: r?.s ?? 0 };
}

/** Whole-client totals for a date range (campaign level avoids double counting). */
export async function clientTotals(env: Env, clientId: number, from: string, to: string): Promise<Totals> {
  const [totals, sales] = await Promise.all([clientInsightTotals(env, clientId, from, to), offlineSales(env, clientId, from, to)]);
  return finalize({ ...totals, ...sales });
}

async function clientInsightTotals(env: Env, clientId: number, from: string, to: string): Promise<RawSums> {
  const row = await env.DB.prepare(
    `SELECT ${SUM_COLS}
     FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
     WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ?`
  )
    .bind(clientId, from, to)
    .first<RawSums>();
  return row ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, leads: 0, purchases: 0, purchase_value: 0 };
}

export type TrendBucket = "day" | "week" | "month";

/** Long ranges are summed per week or month so the chart stays readable (ratios come from the sums). */
export function trendBucket(from: string, to: string): TrendBucket {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return days > 400 ? "month" : days > 120 ? "week" : "day";
}

/** Start of the bucket a date falls in. Weeks start on Monday: date(d, '-6 days', 'weekday 1'). */
const bucketKey = (col: string, bucket: TrendBucket) =>
  bucket === "day" ? col : bucket === "week" ? `date(${col}, '-6 days', 'weekday 1')` : `substr(${col}, 1, 7) || '-01'`;

/**
 * Per day (or week, month) series for the trend chart. Spend and leads come from the ad insights;
 * purchases and their value come from the sales table, the same source as the totals, so the chart
 * adds up to the Key numbers.
 */
export async function clientTrend(env: Env, clientId: number, from: string, to: string, forceBucket?: TrendBucket) {
  const bucket = forceBucket ?? trendBucket(from, to);
  const [rows, sales] = await Promise.all([
    env.DB.prepare(
      `SELECT ${bucketKey("i.date", bucket)} AS date, ${SUM_COLS}
       FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
       WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ?
       GROUP BY 1 ORDER BY 1`
    )
      .bind(clientId, from, to)
      .all<RawSums & { date: string }>(),
    env.DB.prepare(
      `SELECT ${bucketKey("sale_date", bucket)} AS date, COUNT(*) purchases, COALESCE(SUM(value), 0) purchase_value
       FROM dashboard_sales WHERE client_id=? AND sale_date BETWEEN ? AND ? AND deleted_at IS NULL AND COALESCE(pay_status, '') <> 'cancelled'
       GROUP BY 1`
    )
      .bind(clientId, from, to)
      .all<{ date: string; purchases: number; purchase_value: number }>(),
  ]);
  const byDate = new Map<string, RawSums & { date: string }>();
  for (const r of rows.results) byDate.set(r.date, { ...r, purchases: 0, purchase_value: 0 });
  for (const s of sales.results) {
    const r = byDate.get(s.date) ?? { date: s.date, spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, leads: 0, purchases: 0, purchase_value: 0 };
    byDate.set(s.date, { ...r, purchases: s.purchases, purchase_value: s.purchase_value });
  }
  const days = [...byDate.values()].sort((x, y) => (x.date < y.date ? -1 : 1)).map((r) => ({ date: r.date, ...finalize(r) }));
  return { bucket, days };
}

export type EntityRow = Totals & {
  entity_id: string;
  name: string | null;
  level: string;
  parent_id: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  thumbnail_url: string | null;
  previous: Totals;
};

/**
 * Per-entity aggregates for a range, joined with entity metadata and the
 * previous equal-length period for deltas. `parentId` drills down a level.
 */
export async function clientEntities(
  env: Env,
  clientId: number,
  level: "campaign" | "adset" | "ad",
  from: string,
  to: string,
  prevFrom: string,
  prevTo: string,
  parentId?: string
): Promise<EntityRow[]> {
  const parentFilter = parentId ? "AND i.parent_id = ?" : "";
  const bind = (f: string, t: string) => (parentId ? [clientId, level, f, t, parentId] : [clientId, level, f, t]);
  const query = (f: string, t: string) =>
    env.DB.prepare(
      `SELECT i.entity_id, MAX(i.entity_name) entity_name, ${SUM_COLS}
       FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
       WHERE a.client_id=? AND i.level=? AND i.date BETWEEN ? AND ? ${parentFilter}
       GROUP BY i.entity_id`
    ).bind(...bind(f, t));

  const [current, previous, meta] = await Promise.all([
    query(from, to).all<RawSums & { entity_id: string; entity_name: string | null }>(),
    query(prevFrom, prevTo).all<RawSums & { entity_id: string; entity_name: string | null }>(),
    env.DB.prepare(
      `SELECT e.entity_id, e.name, e.status, e.effective_status, e.objective, e.daily_budget, e.lifetime_budget, e.parent_id, e.thumbnail_url
       FROM entities e JOIN ad_accounts a ON a.id = e.ad_account_id
       WHERE a.client_id=? AND e.level=?`
    )
      .bind(clientId, level)
      .all<any>(),
  ]);

  const prevMap = new Map(previous.results.map((r) => [r.entity_id, r]));
  const metaMap = new Map(meta.results.map((r: any) => [r.entity_id, r]));

  return current.results
    .map((r) => {
      const m = metaMap.get(r.entity_id);
      return {
        entity_id: r.entity_id,
        name: m?.name ?? r.entity_name,
        level,
        parent_id: m?.parent_id ?? null,
        status: m?.status ?? null,
        effective_status: m?.effective_status ?? null,
        objective: m?.objective ?? null,
        daily_budget: m?.daily_budget ?? null,
        lifetime_budget: m?.lifetime_budget ?? null,
        thumbnail_url: m?.thumbnail_url ?? null,
        ...finalize(r),
        previous: finalize(prevMap.get(r.entity_id)),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

/** Daily spend series per client for admin-home sparklines. */
export async function clientSparkline(env: Env, clientId: number, from: string, to: string) {
  const rows = await env.DB.prepare(
    `SELECT i.date, SUM(i.spend) spend
     FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
     WHERE a.client_id=? AND i.level='campaign' AND i.date BETWEEN ? AND ?
     GROUP BY i.date ORDER BY i.date`
  )
    .bind(clientId, from, to)
    .all<{ date: string; spend: number }>();
  return rows.results;
}


/**
 * Ad-level creative stats for a range: raw sums from the daily rows (3-second views come
 * from the stored actions, video plays and ThruPlays from the stored extras), then rates and
 * a verdict per ad (see lib/creative.ts).
 */
export async function clientCreatives(env: Env, clientId: number, from: string, to: string) {
  const latest = (field: string) =>
    `(SELECT json_extract(x.extras_json, '$.rank.${field}') FROM insights_daily x
       WHERE x.ad_account_id=i.ad_account_id AND x.level='ad' AND x.entity_id=i.entity_id
         AND json_extract(x.extras_json, '$.rank.${field}') IS NOT NULL ORDER BY x.date DESC LIMIT 1)`;
  const rows = await env.DB.prepare(
    `SELECT i.entity_id, MAX(i.entity_name) AS entity_name,
            SUM(i.spend) spend, SUM(i.impressions) impressions, SUM(i.reach) reach,
            SUM(i.link_clicks) link_clicks, SUM(i.leads) leads,
            SUM((SELECT SUM(CAST(json_extract(j.value, '$.value') AS REAL)) FROM json_each(i.actions_json) j
                 WHERE json_extract(j.value, '$.action_type') = 'video_view')) views3s,
            SUM(COALESCE(json_extract(i.extras_json, '$.video.thruplay'), 0)) thruplays,
            SUM(COALESCE(json_extract(i.extras_json, '$.video.plays'), 0)) plays,
            SUM(COALESCE(json_extract(i.extras_json, '$.video.avg_watch_s'), 0) * COALESCE(json_extract(i.extras_json, '$.video.plays'), 0)) watch_weighted,
            COUNT(DISTINCT CASE WHEN i.spend > 0 THEN i.date END) days_active,
            -- the first day this ad ever spent, over all history (not just the chosen range), so "recently launched" is honest
            (SELECT MIN(f.date) FROM insights_daily f WHERE f.ad_account_id=i.ad_account_id AND f.level='ad' AND f.entity_id=i.entity_id AND f.spend > 0) first_date,
            ${latest("quality")} quality, ${latest("engagement")} engagement, ${latest("conversion")} conversion
     FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
     WHERE a.client_id=? AND i.level='ad' AND i.date BETWEEN ? AND ?
     GROUP BY i.entity_id HAVING SUM(i.spend) > 0`
  )
    .bind(clientId, from, to)
    .all<any>();
  const meta = await env.DB.prepare(
    `SELECT e.entity_id, e.name, e.status, e.effective_status, e.thumbnail_url
     FROM entities e JOIN ad_accounts a ON a.id = e.ad_account_id WHERE a.client_id=? AND e.level='ad'`
  )
    .bind(clientId)
    .all<any>();
  const byId = new Map(meta.results.map((m: any) => [m.entity_id, m]));
  const raws: CreativeRaw[] = rows.results.map((r: any) => {
    const m = byId.get(r.entity_id);
    const rank = (v: string | null) => (v && v !== "UNKNOWN" ? v : null);
    return {
      entity_id: r.entity_id,
      name: m?.name ?? r.entity_name,
      thumbnail_url: m?.thumbnail_url ?? null,
      status: m?.status ?? null,
      effective_status: m?.effective_status ?? null,
      spend: r.spend ?? 0,
      impressions: r.impressions ?? 0,
      reach: r.reach ?? 0,
      link_clicks: r.link_clicks ?? 0,
      leads: r.leads ?? 0,
      views3s: r.views3s ?? 0,
      thruplays: r.thruplays ?? 0,
      plays: r.plays ?? 0,
      watch_weighted: r.watch_weighted ?? 0,
      days_active: r.days_active ?? 0,
      first_date: r.first_date ?? null,
      quality: rank(r.quality),
      engagement: rank(r.engagement),
      conversion: rank(r.conversion),
    };
  });
  return buildCreatives(raws).sort((a, b) => b.spend - a.spend);
}
