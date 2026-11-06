-- Real sales, one row per traveller, for the dashboard (Purchases, value, CPA, ROAS).
-- A sale lives here whether or not it was ever sent to Meta; meta_state says which.
-- Only a short label (first name + initial) is kept, never the full name, phone or email.

CREATE TABLE IF NOT EXISTS sales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sale_key       TEXT NOT NULL,                 -- sha256 of order id, or of name + closing date
  sale_date      TEXT NOT NULL,                 -- YYYY-MM-DD, Jakarta
  value          REAL NOT NULL,                 -- package price minus discount, IDR
  label          TEXT,                          -- "Budi S."
  source         TEXT,                          -- as written in the sheet
  consultant     TEXT,                          -- umroh consultant (staff)
  group_key      TEXT,                          -- sha256 of the booking / decision maker
  has_contact    INTEGER NOT NULL DEFAULT 0,    -- this row carried a usable phone or email
  meta_state     TEXT NOT NULL DEFAULT 'dashboard' CHECK (meta_state IN ('dashboard','sent')),
  meta_event_key TEXT,                          -- offline_events.row_key that carried it
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, sale_key)
);
CREATE INDEX IF NOT EXISTS idx_sales_client_date ON sales(client_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_group ON sales(client_id, group_key);

-- Which sales an event carried, so confirming an uncertain send can mark them.
ALTER TABLE offline_events ADD COLUMN sale_keys_json TEXT;
