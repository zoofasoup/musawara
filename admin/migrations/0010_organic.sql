-- Organic content: Instagram accounts to watch and the stories seen on them.
-- Stories vanish after 24h, so a poller records each one the first time it is seen.
CREATE TABLE IF NOT EXISTS organic_accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ig_user_id       TEXT NOT NULL UNIQUE,
  ig_username      TEXT,
  page_id          TEXT,
  story_target     INTEGER NOT NULL DEFAULT 10,   -- stories per day
  last_poll_at     TEXT,
  last_error       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organic_stories (
  media_id     TEXT PRIMARY KEY,
  ig_user_id   TEXT NOT NULL,
  posted_at    TEXT NOT NULL,        -- ISO timestamp from Meta
  day          TEXT NOT NULL,        -- YYYY-MM-DD in Asia/Jakarta
  media_type   TEXT,
  permalink    TEXT,
  caption      TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_organic_stories_day ON organic_stories (ig_user_id, day);
