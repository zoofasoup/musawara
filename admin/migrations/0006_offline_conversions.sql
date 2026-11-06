-- Offline conversions sent to Meta (Conversions API). Every row ever sent is
-- kept under a deterministic row_key, so the same sale can never go out twice
-- even across files, days or users. Only hashed identifiers are stored.

CREATE TABLE IF NOT EXISTS capi_settings (
  client_id      INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  dataset_id     TEXT,
  action_source  TEXT NOT NULL DEFAULT 'physical_store',
  event_name     TEXT NOT NULL DEFAULT 'Purchase',
  currency       TEXT NOT NULL DEFAULT 'IDR'
);

-- No FK from events to batches: deleting a batch must never erase the memory of what was sent.
CREATE TABLE IF NOT EXISTS offline_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dataset_id      TEXT NOT NULL,
  filename        TEXT,
  is_test         INTEGER NOT NULL DEFAULT 0,
  test_event_code TEXT,
  created_by      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS offline_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id       INTEGER,
  client_id      INTEGER NOT NULL,
  dataset_id     TEXT NOT NULL,
  is_test        INTEGER NOT NULL DEFAULT 0,
  row_key        TEXT NOT NULL,           -- sha256 of order id, or of identity+time+value
  event_name     TEXT NOT NULL,
  event_time     INTEGER NOT NULL,        -- unix seconds
  action_source  TEXT NOT NULL,
  value          REAL,
  currency       TEXT,
  order_id       TEXT,
  user_data_json TEXT NOT NULL,           -- hashed match keys only, in Meta's shape
  status         TEXT NOT NULL CHECK (status IN ('pending','sending','sent','failed')),
  error          TEXT,
  fbtrace_id     TEXT,
  sent_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dataset_id, is_test, row_key)
);
CREATE INDEX IF NOT EXISTS idx_offline_events_batch ON offline_events(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_offline_events_client ON offline_events(client_id, event_time);
