-- Musawara Ads Intelligence — initial schema (v1: Meta Ads reporting)
-- Future modules (CRM, content calendar, invoicing) hang off `clients`.

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  brand_color   TEXT DEFAULT '#f59e0b',
  share_token   TEXT UNIQUE,
  share_enabled INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','client')),
  client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL DEFAULT 'meta',
  meta_account_id TEXT NOT NULL UNIQUE,
  account_name    TEXT,
  currency        TEXT NOT NULL DEFAULT 'IDR',
  timezone        TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account_settings (
  ad_account_id        INTEGER PRIMARY KEY REFERENCES ad_accounts(id) ON DELETE CASCADE,
  primary_result_type  TEXT,
  primary_result_label TEXT DEFAULT 'Results',
  monthly_budget_idr   REAL,
  cpr_target           REAL,
  -- JSON overrides for alert thresholds; see DEFAULT_ALERT_CONFIG in worker/lib/alerts.ts
  alert_config_json    TEXT
);

-- Per-campaign override when a campaign's objective differs from the account default.
CREATE TABLE IF NOT EXISTS campaign_result_overrides (
  campaign_id   TEXT PRIMARY KEY,
  ad_account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  result_type   TEXT NOT NULL,
  result_label  TEXT
);

CREATE TABLE IF NOT EXISTS insights_daily (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_account_id   INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  level           TEXT NOT NULL CHECK (level IN ('campaign','adset','ad')),
  entity_id       TEXT NOT NULL,
  entity_name     TEXT,
  parent_id       TEXT,
  campaign_id     TEXT,
  date            TEXT NOT NULL, -- YYYY-MM-DD in the ad account's timezone
  spend           REAL NOT NULL DEFAULT 0,
  impressions     INTEGER NOT NULL DEFAULT 0,
  reach           INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  link_clicks     INTEGER NOT NULL DEFAULT 0,
  ctr             REAL,
  cpm             REAL,
  frequency       REAL,
  results         REAL,
  cost_per_result REAL,
  actions_json    TEXT, -- full `actions` array from the API, for re-deriving results
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ad_account_id, level, entity_id, date)
);
CREATE INDEX IF NOT EXISTS idx_insights_account_level_date ON insights_daily(ad_account_id, level, date);
CREATE INDEX IF NOT EXISTS idx_insights_parent ON insights_daily(ad_account_id, parent_id, date);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON insights_daily(campaign_id, date);

CREATE TABLE IF NOT EXISTS entities (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_account_id    INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  level            TEXT NOT NULL CHECK (level IN ('campaign','adset','ad')),
  entity_id        TEXT NOT NULL,
  name             TEXT,
  status           TEXT,
  effective_status TEXT,
  objective        TEXT,
  daily_budget     REAL,
  parent_id        TEXT,
  thumbnail_url    TEXT,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ad_account_id, level, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(ad_account_id, parent_id);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_account_id   INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  entity_id       TEXT,
  level           TEXT,
  type            TEXT NOT NULL, -- cpr_spike | creative_fatigue | zero_results | budget_pacing | sync_failure
  severity        TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','critical')),
  message         TEXT NOT NULL,
  metric_value    REAL,
  threshold_value REAL,
  date            TEXT,
  acknowledged    INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_account ON alerts(ad_account_id, acknowledged, created_at);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_account_id INTEGER NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_account ON sync_jobs(ad_account_id, started_at);

CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT NOT NULL UNIQUE,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin','client')),
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key/value app settings (e.g. AES-GCM-encrypted Meta token when pasted via admin UI).
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
