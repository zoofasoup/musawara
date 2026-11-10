-- Publish: connected channels, posts, per-channel targets and media. Dates are UTC text.
CREATE TABLE IF NOT EXISTS channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('instagram','facebook')),
  external_id TEXT NOT NULL,            -- IG user id, or Facebook Page id
  page_id     TEXT,                     -- the Page that owns the IG account (token lookup)
  name        TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, platform, external_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','scheduled','publishing','published','failed','needs_check')),
  kind         TEXT NOT NULL CHECK (kind IN ('feed','carousel','reel','story')),
  caption      TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,                    -- UTC; NULL for drafts
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_client ON posts (client_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts (status, scheduled_at);

CREATE TABLE IF NOT EXISTS post_targets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id          INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id       INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','scheduled','publishing','published','failed','needs_check')),
  external_post_id TEXT,
  container_id     TEXT,
  last_error       TEXT,
  published_at     TEXT,
  UNIQUE (post_id, channel_id)
);

CREATE TABLE IF NOT EXISTS post_media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  r2_key       TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('image','video')),
  bytes        INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  duration_sec REAL,
  UNIQUE (post_id, position)
);
