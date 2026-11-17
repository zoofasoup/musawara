-- Two-way sync of planning cards with the team's Notion "Content Plan + Projects" board.
ALTER TABLE content_plans ADD COLUMN notion_page_id TEXT;
ALTER TABLE content_plans ADD COLUMN notion_edited_at TEXT;   -- Notion's last_edited_time as of our last write or read
ALTER TABLE content_plans ADD COLUMN notion_synced_at TEXT;   -- UTC SQL time of the last sync of this card
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_notion ON content_plans (notion_page_id) WHERE notion_page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notion_sync (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  last_run    TEXT,
  last_error  TEXT,
  summary     TEXT
);
INSERT OR IGNORE INTO notion_sync (id) VALUES (1);
