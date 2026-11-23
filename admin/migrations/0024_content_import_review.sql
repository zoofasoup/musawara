-- Imported items without a verified client stay in a review queue, not in a client's data.
CREATE TABLE content_import_review (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL
);
