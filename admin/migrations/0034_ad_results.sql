-- What a marketplace says its own ads brought (attributed revenue and orders), from the imported reports. It is that platform's
-- claim: never added across platforms and never counted as sales.
CREATE TABLE IF NOT EXISTS ad_results (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source    TEXT NOT NULL CHECK (source IN ('shopee','tiktok','tokopedia','other')),
  date      TEXT NOT NULL, -- YYYY-MM-DD (a monthly report is dated its last day)
  revenue   REAL NOT NULL DEFAULT 0,
  orders    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, source, date)
);
