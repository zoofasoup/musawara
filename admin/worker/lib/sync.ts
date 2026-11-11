// Daily sync: re-pulls the last 28 days at campaign/adset/ad level for every
// active account (Meta restates history due to attribution windows), refreshes
// the entity tree, logs to sync_jobs, then recomputes anomaly alerts.

import type { AdAccountRow, AccountSettingsRow, Env } from "../types";
import { fetchEntityTree, fetchInsights } from "./meta";
import { runAlertRules, checkSyncFailureAlert } from "./alerts";
import { addDays, ymdInTz } from "./dates";
import { buildExtras, deriveKpis } from "./history";

export const SYNC_LOOKBACK_DAYS = 28;
const BATCH_SIZE = 80;

type ResultConfig = {
  primaryType: string | null;
  overrides: Map<string, string>; // campaign_id -> result_type
};

export function deriveResults(
  actions: Array<{ action_type: string; value: string | number }> | null | undefined,
  campaignId: string | null,
  cfg: ResultConfig
): number | null {
  const type = (campaignId && cfg.overrides.get(campaignId)) || cfg.primaryType;
  if (!type || !Array.isArray(actions)) return null;
  const hit = actions.find((a) => a.action_type === type);
  return hit ? Number(hit.value) || 0 : 0;
}

async function getResultConfig(env: Env, adAccountId: number): Promise<ResultConfig> {
  const settings = await env.DB.prepare("SELECT * FROM account_settings WHERE ad_account_id=?")
    .bind(adAccountId)
    .first<AccountSettingsRow>();
  const overrideRows = await env.DB.prepare(
    "SELECT campaign_id, result_type FROM campaign_result_overrides WHERE ad_account_id=?"
  )
    .bind(adAccountId)
    .all<{ campaign_id: string; result_type: string }>();
  return {
    primaryType: settings?.primary_result_type ?? null,
    overrides: new Map(overrideRows.results.map((r) => [r.campaign_id, r.result_type])),
  };
}

async function runBatched(env: Env, statements: D1PreparedStatement[]) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
  }
}

const UPSERT_INSIGHT = `
INSERT INTO insights_daily
  (ad_account_id, level, entity_id, entity_name, parent_id, campaign_id, date,
   spend, impressions, reach, clicks, link_clicks, ctr, cpm, frequency,
   results, cost_per_result, actions_json, leads, purchases, purchase_value, extras_json, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
ON CONFLICT(ad_account_id, level, entity_id, date) DO UPDATE SET
  entity_name=excluded.entity_name, parent_id=excluded.parent_id, campaign_id=excluded.campaign_id,
  spend=excluded.spend, impressions=excluded.impressions, reach=excluded.reach,
  clicks=excluded.clicks, link_clicks=excluded.link_clicks, ctr=excluded.ctr,
  cpm=excluded.cpm, frequency=excluded.frequency, results=excluded.results,
  cost_per_result=excluded.cost_per_result, actions_json=excluded.actions_json,
  leads=excluded.leads, purchases=excluded.purchases, purchase_value=excluded.purchase_value,
  extras_json=excluded.extras_json, updated_at=datetime('now')`;

const UPSERT_ENTITY = `
INSERT INTO entities
  (ad_account_id, level, entity_id, name, status, effective_status, objective,
   daily_budget, parent_id, thumbnail_url, optimization_goal, lifetime_budget, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
ON CONFLICT(ad_account_id, level, entity_id) DO UPDATE SET
  name=excluded.name, status=excluded.status, effective_status=excluded.effective_status,
  objective=excluded.objective, daily_budget=excluded.daily_budget, parent_id=excluded.parent_id,
  thumbnail_url=COALESCE(excluded.thumbnail_url, entities.thumbnail_url),
  optimization_goal=COALESCE(excluded.optimization_goal, entities.optimization_goal),
  lifetime_budget=excluded.lifetime_budget, updated_at=datetime('now')`;

/**
 * Pull campaign/adset/ad insights for [since, until] and upsert them, one level
 * at a time (sequential, rate-limit friendly). Used by the daily sync and by
 * the history backfill, which feeds it one month at a time.
 */
export async function pullInsights(
  env: Env,
  account: AdAccountRow,
  since: string,
  until: string,
  withReach = true,
  recordCoverage = true
): Promise<number> {
  const cfg = await getResultConfig(env, account.id);
  let rows = 0;
  for (const level of ["campaign", "adset", "ad"] as const) {
    const data = await fetchInsights(env, account.meta_account_id, level, since, until, withReach);
    const stmts: D1PreparedStatement[] = [];
    for (const r of data) {
      const entityId = level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id;
      const entityName = level === "campaign" ? r.campaign_name : level === "adset" ? r.adset_name : r.ad_name;
      const parentId = level === "campaign" ? null : level === "adset" ? r.campaign_id : r.adset_id;
      if (!entityId || !r.date_start) continue;
      const spend = Number(r.spend) || 0;
      const impressions = Number(r.impressions) || 0;
      const clicks = Number(r.clicks) || 0;
      const results = deriveResults(r.actions, r.campaign_id ?? null, cfg);
      const kpi = deriveKpis(r);
      stmts.push(
        env.DB.prepare(UPSERT_INSIGHT).bind(
          account.id,
          level,
          entityId,
          entityName ?? null,
          parentId,
          r.campaign_id ?? null,
          r.date_start,
          spend,
          impressions,
          Number(r.reach) || 0,
          clicks,
          Number(r.inline_link_clicks) || 0,
          impressions > 0 ? (clicks / impressions) * 100 : null,
          impressions > 0 ? (spend / impressions) * 1000 : null,
          r.frequency != null ? Number(r.frequency) : null,
          results,
          results && results > 0 ? spend / results : null,
          r.actions ? JSON.stringify(r.actions) : null,
          kpi.leads,
          kpi.purchases,
          kpi.purchase_value,
          buildExtras(r)
        )
      );
    }
    rows += stmts.length;
    await runBatched(env, stmts);
  }
  // Record the range only after all three levels landed.
  if (recordCoverage) await env.DB.prepare(
    "INSERT OR REPLACE INTO insights_coverage (ad_account_id, date_from, date_to, with_reach, pulled_at) VALUES (?,?,?,?,datetime('now'))"
  )
    .bind(account.id, since, until, withReach ? 1 : 0)
    .run();
  return rows;
}

/**
 * Meta returns budgets in the currency's minor unit. For currencies without
 * minor units (IDR among them) the number already is the amount shown in Ads
 * Manager, so dividing by 100 made every Rupiah budget 100x too small.
 */
const NO_MINOR_UNIT = new Set(["CLP", "COP", "CRC", "HUF", "IDR", "ISK", "JPY", "KRW", "PYG", "TWD", "VND"]);
const minorUnit = (currency: string | null | undefined) => (NO_MINOR_UNIT.has(String(currency).toUpperCase()) ? 1 : 100);

/** Hourly refresh of the days still moving: skips the entity tree, coverage record and alerts. */
export const LIGHT_LOOKBACK_DAYS = 2;

export async function syncAccount(
  env: Env,
  account: AdAccountRow,
  light = false
): Promise<{ jobId: number; rows: number }> {
  const job = await env.DB.prepare("INSERT INTO sync_jobs (ad_account_id) VALUES (?) RETURNING id")
    .bind(account.id)
    .first<{ id: number }>();
  const jobId = job!.id;
  let rows = 0;

  try {
    // 1. Entity tree (keep historical rows for deleted/archived entities; just update status)
    const tree = light ? { campaigns: [], adsets: [], ads: [] } : await fetchEntityTree(env, account.meta_account_id);
    const entityStmts: D1PreparedStatement[] = [];
    const push = (level: string, e: any, parentId: string | null, objective: string | null, thumb: string | null) =>
      entityStmts.push(
        env.DB.prepare(UPSERT_ENTITY).bind(
          account.id,
          level,
          e.id,
          e.name ?? null,
          e.status ?? null,
          e.effective_status ?? null,
          objective,
          e.daily_budget != null ? Number(e.daily_budget) / minorUnit(account.currency) : null,
          parentId,
          thumb,
          e.optimization_goal ?? null,
          e.lifetime_budget != null ? Number(e.lifetime_budget) / minorUnit(account.currency) : null
        )
      );
    for (const c of tree.campaigns) push("campaign", c, null, c.objective ?? null, null);
    for (const s of tree.adsets) push("adset", s, s.campaign_id ?? null, null, null);
    for (const a of tree.ads) push("ad", a, a.adset_id ?? null, null, a.creative?.thumbnail_url ?? null);
    await runBatched(env, entityStmts);

    // 2. Insights, 28-day repull (Meta restates recent days)
    const until = ymdInTz(account.timezone);
    const since = addDays(until, -((light ? LIGHT_LOOKBACK_DAYS : SYNC_LOOKBACK_DAYS) - 1));
    rows += await pullInsights(env, account, since, until, true, !light);

    await env.DB.prepare("UPDATE sync_jobs SET finished_at=datetime('now'), status='success', rows_upserted=? WHERE id=?")
      .bind(rows, jobId)
      .run();

    if (!light) await runAlertRules(env, account);
    return { jobId, rows };
  } catch (e: any) {
    await env.DB.prepare("UPDATE sync_jobs SET finished_at=datetime('now'), status='failed', error=? WHERE id=?")
      .bind(String(e?.message ?? e), jobId)
      .run();
    // An hourly blip is not an outage: only full runs count toward the failure alert.
    if (!light) await checkSyncFailureAlert(env, account);
    throw e;
  }
}

/** Sequential sync of the given accounts; one bad account must not block the rest. */
export async function syncAccounts(env: Env, accounts: AdAccountRow[], light = false): Promise<void> {
  for (const account of accounts) {
    try {
      await syncAccount(env, account, light);
    } catch (e) {
      console.error(`sync failed for account ${account.meta_account_id}:`, e);
    }
  }
}

/** All active accounts — used by the cron trigger (full nightly, light hourly). */
export async function syncAllAccounts(env: Env, light = false): Promise<void> {
  const accounts = await env.DB.prepare("SELECT * FROM ad_accounts WHERE status='active'").all<AdAccountRow>();
  await syncAccounts(env, accounts.results, light);
}

/**
 * Recompute `results`/`cost_per_result` from stored actions_json after the admin
 * changes the primary result type — no Meta re-fetch needed.
 */
export async function rederiveResults(env: Env, adAccountId: number): Promise<number> {
  const cfg = await getResultConfig(env, adAccountId);
  let updated = 0;
  let lastId = 0;
  for (;;) {
    const page = await env.DB.prepare(
      "SELECT id, campaign_id, spend, actions_json FROM insights_daily WHERE ad_account_id=? AND id>? ORDER BY id LIMIT 200"
    )
      .bind(adAccountId, lastId)
      .all<{ id: number; campaign_id: string | null; spend: number; actions_json: string | null }>();
    if (page.results.length === 0) break;
    const stmts: D1PreparedStatement[] = [];
    for (const row of page.results) {
      lastId = row.id;
      let actions: any[] | null = null;
      try {
        actions = row.actions_json ? JSON.parse(row.actions_json) : null;
      } catch {
        actions = null;
      }
      const results = deriveResults(actions, row.campaign_id, cfg);
      stmts.push(
        env.DB.prepare("UPDATE insights_daily SET results=?, cost_per_result=? WHERE id=?").bind(
          results,
          results && results > 0 ? row.spend / results : null,
          row.id
        )
      );
    }
    updated += stmts.length;
    await runBatched(env, stmts);
  }
  return updated;
}
