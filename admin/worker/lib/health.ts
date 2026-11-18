// Is the platform alive and doing its scheduled work? The hourly cron records each job's last run in app_settings
// (key "cron:<job>"), and /api/health?deep=1 reports it, so an external uptime monitor can alert when a job stops or fails.

import type { Env } from "../types";

export type CronRecord = { at: string; ok: boolean; error?: string };

/** The cron runs hourly; two missed runs and a bit more means something is wrong. */
export const CRON_STALE_MINUTES = 150;

/** Run one scheduled job, record how it went, and never let its failure escape or go unlogged. */
export async function trackCron(env: Env, job: string, work: () => Promise<unknown>): Promise<void> {
  const at = new Date().toISOString();
  let rec: CronRecord = { at, ok: true };
  try {
    await work();
  } catch (e) {
    const error = String((e as Error)?.message ?? e).slice(0, 300);
    rec = { at, ok: false, error };
    console.error(JSON.stringify({ event: "cron_failed", job, error }));
  }
  try {
    await env.DB.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(`cron:${job}`, JSON.stringify(rec)).run();
  } catch {
    /* recording is best effort; the log line above already exists */
  }
}

export type Health = { ok: boolean; db: boolean; crons: Record<string, { ageMinutes: number | null; ok: boolean; stale: boolean; error?: string }> };

export async function healthReport(env: Env, now = Date.now()): Promise<Health> {
  let db = false;
  const crons: Health["crons"] = {};
  try {
    await env.DB.prepare("SELECT 1").first();
    db = true;
    const rows = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'cron:%'").all<{ key: string; value: string }>();
    for (const r of rows.results) {
      let rec: CronRecord | null = null;
      try { rec = JSON.parse(r.value); } catch { /* unreadable record counts as unhealthy below */ }
      const age = rec ? Math.round((now - Date.parse(rec.at)) / 60000) : null;
      const stale = age == null || age > CRON_STALE_MINUTES;
      crons[r.key.slice(5)] = { ageMinutes: age, ok: Boolean(rec?.ok), stale, ...(rec?.error ? { error: rec.error } : {}) };
    }
  } catch {
    /* db stays false */
  }
  const ok = db && Object.values(crons).every((c) => c.ok && !c.stale);
  return { ok, db, crons };
}
