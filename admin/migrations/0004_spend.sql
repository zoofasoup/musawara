-- Unified spend: Meta (derived from insights_daily) + marketplace and other
-- spend entered by hand. API adapters for Shopee/TikTok can insert into
-- spend_entries later without touching the view or the dashboard.
CREATE TABLE IF NOT EXISTS spend_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE, -- NULL = company-wide
  source     TEXT NOT NULL CHECK (source IN ('shopee','tiktok','tokopedia','other')),
  category   TEXT NOT NULL DEFAULT 'ads' CHECK (category IN ('ads','fee')),
  date       TEXT NOT NULL, -- YYYY-MM-DD
  amount     REAL NOT NULL CHECK (amount > 0), -- IDR
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spend_entries_date ON spend_entries(date, client_id);

-- Campaign level only: adset/ad rows repeat the same spend.
CREATE VIEW IF NOT EXISTS spend_daily AS
  SELECT 'meta' AS source, 'ads' AS category, a.client_id AS client_id, i.date AS date, SUM(i.spend) AS amount
  FROM insights_daily i JOIN ad_accounts a ON a.id = i.ad_account_id
  WHERE i.level = 'campaign'
  GROUP BY a.client_id, i.date
  UNION ALL
  SELECT source, category, client_id, date, amount FROM spend_entries;
