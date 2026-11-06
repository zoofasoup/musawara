-- Extended insights: lead/purchase KPIs, richer per-day extras, ad-set optimization
-- goal and budgets, and a coverage log so history backfills never re-pull
-- ranges that are already final.

ALTER TABLE insights_daily ADD COLUMN leads INTEGER NOT NULL DEFAULT 0;          -- messaging conversations started
ALTER TABLE insights_daily ADD COLUMN purchases INTEGER NOT NULL DEFAULT 0;
ALTER TABLE insights_daily ADD COLUMN purchase_value REAL NOT NULL DEFAULT 0;    -- IDR
ALTER TABLE insights_daily ADD COLUMN extras_json TEXT;                          -- roas, video, quality rankings

ALTER TABLE entities ADD COLUMN optimization_goal TEXT;
ALTER TABLE entities ADD COLUMN lifetime_budget REAL;

-- Leads for rows already stored come from the saved `actions` array: no re-pull.
UPDATE insights_daily
SET leads = COALESCE((
  SELECT SUM(CAST(json_extract(j.value, '$.value') AS REAL))
  FROM json_each(insights_daily.actions_json) j
  WHERE json_extract(j.value, '$.action_type') = 'onsite_conversion.messaging_conversation_started_7d'
), 0)
WHERE actions_json IS NOT NULL AND json_valid(actions_json);

-- One row per successfully pulled range. Ranges older than ~28 days are final
-- (Meta stops restating them), so the backfill skips what is already covered.
CREATE TABLE IF NOT EXISTS insights_coverage (
  ad_account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  date_from     TEXT NOT NULL,
  date_to       TEXT NOT NULL,
  with_reach    INTEGER NOT NULL DEFAULT 1, -- 0 = pulled without reach/frequency (older than Meta's 13-month window)
  pulled_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ad_account_id, date_from, date_to)
);
