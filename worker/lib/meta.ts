// Meta Marketing API client: token resolution, throttling-aware fetch with
// exponential backoff, pagination, insights + entity-tree fetchers.

import type { Env } from "../types";
import { decryptString } from "./secretbox";

export const META_API_VERSION = "v23.0";
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export const INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpm",
  "frequency",
  "actions",
  "cost_per_action_type",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "date_start",
].join(",");

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
  maxPages = 50
): Promise<any[]> {
  const out: any[] = [];
  let body = await metaGet(env, path, params);
  for (let page = 0; page < maxPages; page++) {
    if (Array.isArray(body?.data)) out.push(...body.data);
    const next: string | undefined = body?.paging?.next;
    if (!next) break;
    body = await metaGet(env, next, {});
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
  return metaGet(env, id, { fields: "id,name,currency,timezone_name,account_status" }, 1);
}

export async function fetchInsights(
  env: Env,
  metaAccountId: string,
  level: "campaign" | "adset" | "ad",
  since: string,
  until: string
): Promise<any[]> {
  const id = metaAccountId.startsWith("act_") ? metaAccountId : `act_${metaAccountId}`;
  return metaGetAll(env, `${id}/insights`, {
    level,
    fields: INSIGHT_FIELDS,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
}

export async function fetchEntityTree(env: Env, metaAccountId: string) {
  const id = metaAccountId.startsWith("act_") ? metaAccountId : `act_${metaAccountId}`;
  const [campaigns, adsets, ads] = [
    await metaGetAll(env, `${id}/campaigns`, {
      fields: "id,name,status,effective_status,objective,daily_budget",
      limit: "200",
    }),
    await metaGetAll(env, `${id}/adsets`, {
      fields: "id,name,status,effective_status,daily_budget,campaign_id",
      limit: "200",
    }),
    await metaGetAll(env, `${id}/ads`, {
      fields: "id,name,status,effective_status,adset_id,campaign_id,creative{thumbnail_url}",
      limit: "200",
    }),
  ];
  return { campaigns, adsets, ads };
}
