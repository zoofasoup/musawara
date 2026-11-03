-- Brand knowledge: one markdown body per (client, section), plus reference links
-- (logo folders, guidelines PDFs). Sections are fixed in worker/lib/brand.ts.

CREATE TABLE IF NOT EXISTS brand_knowledge (
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  PRIMARY KEY (client_id, section)
);

CREATE TABLE IF NOT EXISTS brand_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_brand_links_client ON brand_links(client_id);
