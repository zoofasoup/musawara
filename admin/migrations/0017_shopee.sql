-- Shopee Open Platform, for the sales dashboard only. One shop per client.
-- Shopee's Data Protection Policy bans keeping buyer personal data beyond 90 days, so none is stored:
-- orders hold only the order number, status, time, total and line items (product, quantity, price).
-- Tokens are AES-GCM encrypted (worker/lib/secretbox.ts). Times are unix seconds.
CREATE TABLE IF NOT EXISTS shopee_shops (
  client_id          INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  shop_id            INTEGER NOT NULL,
  access_token_enc   TEXT NOT NULL,
  refresh_token_enc  TEXT NOT NULL,
  access_expires_at  INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  synced_to          INTEGER NOT NULL,
  last_sync_at       TEXT,
  last_error         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopee_orders (
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_sn     TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_ts   INTEGER NOT NULL,
  updated_ts   INTEGER NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'IDR',
  PRIMARY KEY (client_id, order_sn)
);
CREATE INDEX IF NOT EXISTS idx_shopee_orders_day ON shopee_orders (client_id, created_ts);

CREATE TABLE IF NOT EXISTS shopee_order_items (
  client_id  INTEGER NOT NULL,
  order_sn   TEXT NOT NULL,
  item_id    INTEGER NOT NULL,
  model_id   INTEGER NOT NULL DEFAULT 0,
  item_name  TEXT NOT NULL DEFAULT '',
  quantity   INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (client_id, order_sn, item_id, model_id),
  FOREIGN KEY (client_id, order_sn) REFERENCES shopee_orders (client_id, order_sn) ON DELETE CASCADE
);
