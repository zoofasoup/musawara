// Anomaly detection — runs after each sync. Defaults below are overridable per
// account via account_settings.alert_config_json (partial JSON, merged over defaults).

import type { AdAccountRow, AccountSettingsRow, Env } from "../types";
import { addDays, dayOfMonth, daysInMonth, monthStart, ymdInTz } from "./dates";

export const DEFAULT_ALERT_CONFIG = {
  cpr_spike_warning_pct: 30,
  cpr_spike_critical_pct: 60,
  cpr_spike_min_spend: 100_000, // Rp
  fatigue_frequency: 3.5,
  fatigue_ctr_decline_pct: 20,
  zero_results_min_spend: 150_000, // Rp
  pacing_deviation_pct: 20,
};
export type AlertConfig = typeof DEFAULT_ALERT_CONFIG;

export function resolveAlertConfig(settings: AccountSettingsRow | null): AlertConfig {
  if (!settings?.alert_config_json) return DEFAULT_ALERT_CONFIG;
  try {
    return { ...DEFAULT_ALERT_CONFIG, ...JSON.parse(settings.alert_config_json) };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

const fmtRp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

type NewAlert = {
  entity_id: string | null;
  level: string | null;
  type: string;
  severity: "warning" | "critical";
  message: string;
  metric_value: number | null;
  threshold_value: number | null;
  date: string;
};

/** Insert unless an identical unacknowledged alert already exists (dedup rule). */
async function insertAlert(env: Env, adAccountId: number, a: NewAlert): Promise<boolean> {
  const existing = await env.DB.prepare(
    "SELECT id FROM alerts WHERE ad_account_id=? AND IFNULL(entity_id,'')=IFNULL(?,'') AND type=? AND severity=? AND acknowledged=0"
  )
    .bind(adAccountId, a.entity_id, a.type, a.severity)
    .first();
  if (existing) return false;
  await env.DB.prepare(
    `INSERT INTO alerts (ad_account_id, entity_id, level, type, severity, message, metric_value, threshold_value, date)
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
    .bind(adAccountId, a.entity_id, a.level, a.type, a.severity, a.message, a.metric_value, a.threshold_value, a.date)
    .run();
  return true;
}

type Agg = { entity_id: string; entity_name: string | null; spend: number; results: number; clicks: number; impressions: number; reach: number };

async function aggregate(
  env: Env,
  adAccountId: number,
  level: string,
  from: string,
  to: string
): Promise<Map<string, Agg>> {
  const rows = await env.DB.prepare(
    `SELECT entity_id, MAX(entity_name) entity_name, SUM(spend) spend, SUM(COALESCE(results,0)) results,
            SUM(clicks) clicks, SUM(impressions) impressions, SUM(reach) reach
     FROM insights_daily
     WHERE ad_account_id=? AND level=? AND date BETWEEN ? AND ?
     GROUP BY entity_id`
  )
    .bind(adAccountId, level, from, to)
    .all<Agg>();
  return new Map(rows.results.map((r) => [r.entity_id, r]));
}

export async function runAlertRules(env: Env, account: AdAccountRow): Promise<number> {
  const settings = await env.DB.prepare("SELECT * FROM account_settings WHERE ad_account_id=?")
    .bind(account.id)
    .first<AccountSettingsRow>();
  const cfg = resolveAlertConfig(settings);
  const today = ymdInTz(account.timezone);
  let created = 0;

  // ---- Rules 1 & 3 use campaign-level windows: last 3 days vs previous 7 days
  const last3From = addDays(today, -2);
  const prev7From = addDays(today, -9);
  const prev7To = addDays(today, -3);
  const recent = await aggregate(env, account.id, "campaign", last3From, today);
  const baseline = await aggregate(env, account.id, "campaign", prev7From, prev7To);

  for (const [campaignId, cur] of recent) {
    const name = cur.entity_name ?? campaignId;

    // Rule 3 — zero results despite meaningful spend (broken optimization events)
    if (cur.spend >= cfg.zero_results_min_spend && cur.results === 0) {
      created += +(await insertAlert(env, account.id, {
        entity_id: campaignId,
        level: "campaign",
        type: "zero_results",
        severity: "critical",
        message: `"${name}" spent ${fmtRp(cur.spend)} in the last 3 days with 0 results — check the optimization event.`,
        metric_value: cur.spend,
        threshold_value: cfg.zero_results_min_spend,
        date: today,
      }));
      continue;
    }

    // Rule 1 — CPR spike: last-3-day avg vs previous-7-day avg
    const prev = baseline.get(campaignId);
    if (!prev || cur.spend < cfg.cpr_spike_min_spend || cur.results <= 0 || prev.results <= 0) continue;
    const cprNow = cur.spend / cur.results;
    const cprBase = prev.spend / prev.results;
    if (cprBase <= 0) continue;
    const increasePct = ((cprNow - cprBase) / cprBase) * 100;
    if (increasePct > cfg.cpr_spike_warning_pct) {
      const critical = increasePct > cfg.cpr_spike_critical_pct;
      created += +(await insertAlert(env, account.id, {
        entity_id: campaignId,
        level: "campaign",
        type: "cpr_spike",
        severity: critical ? "critical" : "warning",
        message: `"${name}" CPR is up ${Math.round(increasePct)}% (${fmtRp(cprNow)} vs ${fmtRp(cprBase)} baseline).`,
        metric_value: cprNow,
        threshold_value: cprBase,
        date: today,
      }));
    }
  }

  // ---- Rule 2 — creative fatigue: ad frequency > threshold AND CTR down ≥20% vs prior 7 days
  const adNow = await aggregate(env, account.id, "ad", addDays(today, -6), today);
  const adPrev = await aggregate(env, account.id, "ad", addDays(today, -13), addDays(today, -7));
  for (const [adId, cur] of adNow) {
    const prev = adPrev.get(adId);
    if (!prev || cur.reach <= 0 || cur.impressions <= 0 || prev.impressions <= 0) continue;
    const freq = cur.impressions / cur.reach;
    const ctrNow = cur.clicks / cur.impressions;
    const ctrPrev = prev.clicks / prev.impressions;
    if (ctrPrev <= 0) continue;
    const declinePct = ((ctrPrev - ctrNow) / ctrPrev) * 100;
    if (freq > cfg.fatigue_frequency && declinePct >= cfg.fatigue_ctr_decline_pct) {
      created += +(await insertAlert(env, account.id, {
        entity_id: adId,
        level: "ad",
        type: "creative_fatigue",
        severity: "warning",
        message: `Ad "${cur.entity_name ?? adId}" is fatigued: frequency ${freq.toFixed(1)}, CTR down ${Math.round(declinePct)}% vs prior week.`,
        metric_value: freq,
        threshold_value: cfg.fatigue_frequency,
        date: today,
      }));
    }
  }

  // ---- Rule 4 — budget pacing: projected month-end spend deviates ±20% from budget
  if (settings?.monthly_budget_idr && settings.monthly_budget_idr > 0) {
    const mtd = await env.DB.prepare(
      "SELECT SUM(spend) spend FROM insights_daily WHERE ad_account_id=? AND level='campaign' AND date BETWEEN ? AND ?"
    )
      .bind(account.id, monthStart(today), today)
      .first<{ spend: number | null }>();
    const spent = mtd?.spend ?? 0;
    const projected = (spent / dayOfMonth(today)) * daysInMonth(today);
    const deviationPct = ((projected - settings.monthly_budget_idr) / settings.monthly_budget_idr) * 100;
    if (Math.abs(deviationPct) > cfg.pacing_deviation_pct) {
      const dir = deviationPct > 0 ? "overspend" : "underspend";
      created += +(await insertAlert(env, account.id, {
        entity_id: null,
        level: "account",
        type: "budget_pacing",
        severity: "warning",
        message: `${account.account_name ?? "Account"} is pacing to ${dir}: projected ${fmtRp(projected)} vs budget ${fmtRp(settings.monthly_budget_idr)} (${deviationPct > 0 ? "+" : ""}${Math.round(deviationPct)}%).`,
        metric_value: projected,
        threshold_value: settings.monthly_budget_idr,
        date: today,
      }));
    }
  }

  return created;
}

/** Rule 5 — two consecutive failed syncs. Called after a failed sync. */
export async function checkSyncFailureAlert(env: Env, account: AdAccountRow): Promise<void> {
  const last2 = await env.DB.prepare(
    "SELECT status FROM sync_jobs WHERE ad_account_id=? ORDER BY started_at DESC, id DESC LIMIT 2"
  )
    .bind(account.id)
    .all<{ status: string }>();
  if (last2.results.length === 2 && last2.results.every((r) => r.status === "failed")) {
    await insertAlert(env, account.id, {
      entity_id: null,
      level: "account",
      type: "sync_failure",
      severity: "critical",
      message: `${account.account_name ?? account.meta_account_id} failed to sync 2 consecutive runs — data is stale.`,
      metric_value: null,
      threshold_value: null,
      date: ymdInTz(account.timezone),
    });
  }
}
