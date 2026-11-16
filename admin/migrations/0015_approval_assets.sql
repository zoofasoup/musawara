-- Asset library (Google Drive links only, no file bytes) and the client approval flow.
-- Dates are UTC text. Every row hangs off a client; routes always scope by that client_id.
CREATE TABLE IF NOT EXISTS assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('image','video','doc','other')),
  drive_url  TEXT NOT NULL,             -- https://drive.google.com/... or https://docs.google.com/...
  tags       TEXT NOT NULL DEFAULT '',  -- comma-separated, lower case
  notes      TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_client ON assets (client_id, created_at);

CREATE TABLE IF NOT EXISTS approval_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  post_id    INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested')),
  version    INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_client ON approval_requests (client_id, status, updated_at);

CREATE TABLE IF NOT EXISTS approval_request_assets (
  request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (request_id, asset_id)
);

-- Append-only: one row per submit, resubmit and decision.
CREATE TABLE IF NOT EXISTS approval_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('submitted','resubmitted','approved','changes_requested')),
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  comment    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approval_history_request ON approval_history (request_id, id);
