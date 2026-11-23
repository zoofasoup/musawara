-- Imported snapshots are read-only with respect to the legacy two-way Notion sync.
ALTER TABLE content_plans ADD COLUMN source_notion_id TEXT;
CREATE UNIQUE INDEX content_plans_source_notion ON content_plans(source_notion_id) WHERE source_notion_id IS NOT NULL;
