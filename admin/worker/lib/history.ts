// History backfill planning: calendar half-month chunks, coverage merging,
// and the per-row KPI extraction shared by the daily sync and the backfill.

import { addDays } from "./dates";

export type Chunk = { since: string; until: string };

/** A chunk older than this many days is final: Meta no longer restates it. */
export const FINAL_AFTER_DAYS = 29;
/** Reach/frequency per day are only available ~13 months back. */
export const REACH_WINDOW_DAYS = 395;
/** Meta keeps about 37 months of insights. */
export const MAX_HISTORY_DAYS = 1125;

/** Half-month chunks (1–15, 16–end) covering [from, to]; stable regardless of `from`. */
export function halfMonthChunks(from: string, to: string): Chunk[] {
  const out: Chunk[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const ym = (n: number) => String(n).padStart(2, "0");
  while (y < ty || (y === ty && m <= tm)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const [d1, d2] of [[1, 15], [16, last]] as const) {
      const since = `${y}-${ym(m)}-${ym(d1)}`;
      const until = `${y}-${ym(m)}-${ym(d2)}`;
      if (until < from || since > to) continue;
      out.push({ since: since < from ? from : since, until: until > to ? to : until });
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

type Range = { date_from: string; date_to: string };

/** Merge touching/overlapping ranges so "covered" means a single interval holds the chunk. */
export function mergeRanges(rows: Range[]): Range[] {
  const sorted = [...rows].sort((a, b) => a.date_from.localeCompare(b.date_from));
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.date_from <= addDays(last.date_to, 1)) {
      if (r.date_to > last.date_to) last.date_to = r.date_to;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

export function isCovered(chunk: Chunk, merged: Range[], today: string): boolean {
  if (chunk.until > addDays(today, -FINAL_AFTER_DAYS)) return false; // still restated by Meta
  return merged.some((r) => r.date_from <= chunk.since && r.date_to >= chunk.until);
}

type Action = { action_type: string; value: string | number };

const sumType = (list: Action[] | undefined, type: string) =>
  Array.isArray(list) ? list.filter((a) => a.action_type === type).reduce((s, a) => s + (Number(a.value) || 0), 0) : 0;

const firstPresent = (list: Action[] | undefined, types: string[]) => {
  for (const t of types) if (Array.isArray(list) && list.some((a) => a.action_type === t)) return t;
  return null;
};

const PURCHASE_TYPES = ["omni_purchase", "purchase", "offline_conversion.purchase"];

/** Lead = messaging conversation started; purchase = first available purchase type (no double counting). */
export function deriveKpis(row: { actions?: Action[]; action_values?: Action[] }) {
  const pType = firstPresent(row.actions, PURCHASE_TYPES);
  return {
    leads: sumType(row.actions, "onsite_conversion.messaging_conversation_started_7d"),
    purchases: pType ? sumType(row.actions, pType) : 0,
    purchase_value: pType ? sumType(row.action_values, pType) : 0,
  };
}

const first = (v: Array<{ value: string | number }> | undefined) => (Array.isArray(v) && v[0] ? Number(v[0].value) || 0 : null);

/** Compact extras kept as JSON: ROAS, video engagement, ad quality rankings. */
export function buildExtras(r: any): string | null {
  const extras: Record<string, unknown> = {};
  const roas = first(r.purchase_roas);
  if (roas != null) extras.roas = roas;
  const video = {
    plays: first(r.video_play_actions),
    thruplay: first(r.video_thruplay_watched_actions),
    avg_watch_s: first(r.video_avg_time_watched_actions),
  };
  if (Object.values(video).some((v) => v != null)) extras.video = video;
  const rank = { quality: r.quality_ranking, engagement: r.engagement_rate_ranking, conversion: r.conversion_rate_ranking };
  if (Object.values(rank).some((v) => v)) extras.rank = rank;
  return Object.keys(extras).length ? JSON.stringify(extras) : null;
}
