-- Manual corrections. A row edited by hand is never overwritten by a later upload of the
-- original file; a row deleted by hand stays out of the dashboard and is not re-added by one.
ALTER TABLE sales ADD COLUMN edited_at  TEXT;
ALTER TABLE sales ADD COLUMN deleted_at TEXT;
