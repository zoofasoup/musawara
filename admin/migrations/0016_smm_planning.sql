-- SMM planning layer: content ideas that can exist before a real Publish post.
-- Stage changes are validated in the API (worker/lib/planning.ts). A card may link to a posts row;
-- a scheduled/published post moves its card forward, never the reverse. Dates are UTC text,
-- planned_date is a plain Asia/Jakarta calendar day (YYYY-MM-DD).
CREATE TABLE IF NOT EXISTS content_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  brief         TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'feed' CHECK (kind IN ('feed','carousel','reel','story')),
  stage         TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','drafting','in_review','scheduled','published')),
  planned_date  TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  post_id       INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plans_client ON content_plans (client_id, stage);
CREATE INDEX IF NOT EXISTS idx_plans_date ON content_plans (planned_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_post ON content_plans (post_id) WHERE post_id IS NOT NULL;
