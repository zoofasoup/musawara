-- Orders pulled from Jubelio (every sales channel of one brand). No buyer data: only what a sales report needs.
CREATE TABLE jubelio_orders (
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  salesorder_id INTEGER NOT NULL,
  order_no      TEXT NOT NULL,
  day           TEXT NOT NULL,                 -- Asia/Jakarta calendar day of the transaction
  channel       TEXT NOT NULL,
  store         TEXT,
  total         REAL NOT NULL DEFAULT 0,       -- Jubelio grand_total
  status        TEXT,
  canceled      INTEGER NOT NULL DEFAULT 0,
  paid          INTEGER NOT NULL DEFAULT 0,
  modified      TEXT,
  PRIMARY KEY (client_id, salesorder_id)
);
CREATE INDEX idx_jubelio_orders_day ON jubelio_orders (client_id, day);

CREATE TABLE jubelio_sync (
  client_id    INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  synced_to    TEXT,                           -- orders changed up to this moment have been read
  last_sync_at TEXT,
  last_error   TEXT
);
