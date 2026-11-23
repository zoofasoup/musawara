// Meta Marketing API client: token resolution, throttling-aware fetch with
// exponential backoff, pagination, insights + entity-tree fetchers.

import type { Env } from "../types";
import { decryptString } from "./secretbox";
import { fetchResilient } from "./history";

export const META_API_VERSION = "v23.0";
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const BASE_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpm",
  "actions",
  "cost_per_action_type",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "date_start",
];
const REACH_FIELDS = ["reach", "frequency"];
const EXTRA_FIELDS = [
  "action_values",
  "purchase_roas",
  "video_play_actions",
  "video_thruplay_watched_actions",
  "video_avg_time_watched_actions",
];
// Quality rankings only exist per ad.
const RANKING_FIELDS = ["quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking"];

/**
 * Insight fields for a level. `extras` = the richer set (values, ROAS, video,
 * rankings); `withReach` is false for data older than Meta's 13-month reach window.
 */
export function insightFields(level: "campaign" | "adset" | "ad", opts: { extras: boolean; withReach: boolean }): string {
  return [
    ...BASE_FIELDS,
    ...(opts.withReach ? REACH_FIELDS : []),
    ...(opts.extras ? EXTRA_FIELDS : []),
    ...(opts.extras && level === "ad" ? RANKING_FIELDS : []),
  ].join(",");
}

export class MetaApiError extends Error {
  code: number;
  transient: boolean;
  constructor(message: string, code: number, transient: boolean) {
    super(message);
    this.code = code;
    this.transient = transient;
  }
}

/** Env secret wins; otherwise the encrypted token pasted via admin settings. */
export async function getMetaToken(env: Env): Promise<string | null> {
  if (env.META_ACCESS_TOKEN) return env.META_ACCESS_TOKEN;
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='meta_token_enc'").first<{
    value: string;
  }>();
  if (!row?.value) return null;
  try {
    return await decryptString(env.JWT_SECRET, row.value);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Rate-limit codes per Meta docs: 4 (app), 17 (user), 32, 613, 80000-80014 (BUC).
function isTransient(code: number, httpStatus: number): boolean {
  if (httpStatus >= 500) return true;
  return code === 4 || code === 17 || code === 32 || code === 613 || (code >= 80000 && code <= 80014);
}

/** Reads X-Business-Use-Case-Usage and returns the max utilization percent seen. */
function parseUsage(res: Response): number {
  const header = res.headers.get("x-business-use-case-usage");
  if (!header) return 0;
  let max = 0;
  try {
    const usage = JSON.parse(header) as Record<string, Array<Record<string, number>>>;
    for (const entries of Object.values(usage)) {
      for (const entry of entries) {
        for (const key of ["call_count", "total_cputime", "total_time"]) {
          if (typeof entry[key] === "number") max = Math.max(max, entry[key]);
        }
      }
    }
  } catch {
    // ignore malformed header
  }
  return max;
}

export async function metaGet(
  env: Env,
  path: string,
  params: Record<string, string> = {},
  maxRetries = 4
): Promise<any> {
  const token = await getMetaToken(env);
  if (!token) throw new MetaApiError("No Meta access token configured", 0, false);

  for (let attempt = 0; ; attempt++) {
    const url = new URL(path.startsWith("http") ? path : `${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);

    const res = await fetch(url.toString());
    const usage = parseUsage(res);
    const body: any = await res.json().catch(() => ({}));

    if (res.ok) {
      // Soft-throttle: slow down before Meta starts rejecting calls.
      if (usage >= 90) await sleep(30_000);
      else if (usage >= 75) await sleep(5_000);
      return body;
    }

    const code = body?.error?.code ?? 0;
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const transient = isTransient(code, res.status);
    if (transient && attempt < maxRetries) {
      await sleep(Math.min(2000 * 2 ** attempt, 60_000));
      continue;
    }
    throw new MetaApiError(message, code, transient);
  }
}

/** Follows `paging.next` links; hard cap to avoid runaway loops. */
export async function metaGetAll(
  env: Env,
  path: string,
  params: Record<string, string>,
  maxPages = 50,
  retries = 4
): Promise<any[]> {
  const out: any[] = [];
  let body = await metaGet(env, path, params, retries);
  for (let page = 0; page < maxPages; page++) {
    if (Array.isArray(body?.data)) out.push(...body.data);
    const next: string | undefined = body?.paging?.next;
    if (!next) break;
    body = await metaGet(env, next, {}, retries);
  }
  return out;
}

/** `/me` check — used for token validation and expiry surfacing in the admin UI. */
export async function validateToken(env: Env): Promise<{ ok: boolean; name?: string; id?: string; error?: string }> {
  try {
    const me = await metaGet(env, "me", { fields: "id,name" }, 1);
    return { ok: true, name: me.name, id: me.id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function fetchAccountInfo(env: Env, metaAccountId: string) {
  const id = metaAccountId.startsWith("act_") ? metaAccountId : `act_${metaAccountId}`;
  return metaGet(env, id, { fields: "id,name,currency,timezone_name,account_status,created_time" }, 1);
}

/** Meta codes/messages that mean "this query is too heavy or Meta is hiccuping right now". */
function classifyInsightsError(e: unknown): "retry" | "bad_field" | "fatal" {
  if (!(e instanceof MetaApiError)) return "fatal";
  if (e.code === 100) return "bad_field";
  const heavy = /temporarily unavailable|reduce the amount of data|unknown error|try again/i.test(e.message);
  return e.transient || e.code === 1 || e.code === 2 || heavy ? "retry" : "fatal";
}

export async function fetchInsights(
  env: Env,
  metaAccountId: string,
  level: "campaign" | "adset" | "ad",
  since: string,
  until: string,
  withReach = true
): Promise<any[]> {
  const id = metaAccountId.startsWith("act_") ? metaAccountId : `act_${metaAccountId}`;
  // retries=1: a heavy query will not get lighter by waiting, splitting the range does.
  return fetchResilient(
    (s, u, extras) =>
      metaGetAll(
        env,
        `${id}/insights`,
        {
          level,
          fields: insightFields(level, { extras, withReach }),
          time_increment: "1",
          time_range: JSON.stringify({ since: s, until: u }),
          limit: "500",
        },
        50,
        1
      ),
    since,
    until,
    classifyInsightsError
  );
}

/**
 * Without a status filter Meta leaves archived (and deleted) campaigns, ad sets and ads out of these lists, although their past spend
 * is in the insights. Asking for every status keeps their names and thumbnails.
 */
const ALL_STATUSES = JSON.stringify([
  "ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "PENDING_REVIEW", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES",
]);
export const AD_FIELDS = "id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url}";

export async function fetchEntityTree(env: Env, metaAccountId: string) {
  const id = metaAccountId.startsWith("act_") ? metaAccountId : `act_${metaAccountId}`;
  const [campaigns, adsets, ads] = [
    await metaGetAll(env, `${id}/campaigns`, {
      fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
      effective_status: ALL_STATUSES,
      limit: "200",
    }),
    await metaGetAll(env, `${id}/adsets`, {
      fields: "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,campaign_id",
      effective_status: ALL_STATUSES,
      limit: "200",
    }),
    await metaGetAll(env, `${id}/ads`, {
      fields: AD_FIELDS,
      effective_status: ALL_STATUSES,
      limit: "200",
    }),
  ];
  return { campaigns, adsets, ads };
}

/**
 * Ads we have spend for but no record of (new since the last full sync, or gone from the lists above), looked up by id.
 * One request for a group of ids; if Meta refuses the group because one id is unreadable, those ids are tried one by one.
 * Returns the ads Meta answered for; ids it would not answer for are simply absent.
 */
export async function fetchAdsById(env: Env, ids: string[], maxSingles = 20): Promise<any[]> {
  const out: any[] = [];
  let singles = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const group = ids.slice(i, i + 50);
    try {
      const body = await metaGet(env, "", { ids: group.join(","), fields: AD_FIELDS }, 1);
      out.push(...Object.values(body ?? {}).filter((a: any) => a && typeof a === "object" && a.id));
    } catch {
      for (const id of group) {
        if (singles++ >= maxSingles) break;
        try {
          const a = await metaGet(env, id, { fields: AD_FIELDS }, 0);
          if (a?.id) out.push(a);
        } catch {
          /* not readable (deleted for good): left for the caller to mark */
        }
      }
    }
  }
  return out;
}
