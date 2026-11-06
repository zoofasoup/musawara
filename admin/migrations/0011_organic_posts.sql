-- Main posts (reels, feed photos/videos, carousels) with their latest insights.
ALTER TABLE organic_accounts ADD COLUMN followers INTEGER;

CREATE TABLE IF NOT EXISTS organic_posts (
  media_id      TEXT PRIMARY KEY,
  ig_user_id    TEXT NOT NULL,
  posted_at     TEXT NOT NULL,
  day           TEXT NOT NULL,          -- YYYY-MM-DD in Asia/Jakarta
  format        TEXT NOT NULL,          -- reel | carousel | video | image
  permalink     TEXT,
  caption       TEXT,
  likes         INTEGER,
  comments      INTEGER,
  reach         INTEGER,
  views         INTEGER,
  saves         INTEGER,
  shares        INTEGER,
  interactions  INTEGER,
  avg_watch_ms  INTEGER,                -- reels only
  insights_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_organic_posts_acc ON organic_posts (ig_user_id, posted_at);
