-- Follow-up tasks, notes, and who owns a lead. Same keys as the pipeline: (gateway number id, phone).
CREATE TABLE crm_tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id    INTEGER NOT NULL,
  phone            TEXT NOT NULL,
  title            TEXT NOT NULL,
  due_date         TEXT,                       -- YYYY-MM-DD, Asia/Jakarta
  assignee_user_id INTEGER,
  done_at          TEXT,
  created_by       INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crm_tasks_account ON crm_tasks (wa_account_id, done_at, due_date);
CREATE INDEX idx_crm_tasks_contact ON crm_tasks (wa_account_id, phone);

CREATE TABLE crm_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id INTEGER NOT NULL,
  phone         TEXT NOT NULL,
  body          TEXT NOT NULL,
  user_id       INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crm_notes_contact ON crm_notes (wa_account_id, phone, id);

ALTER TABLE crm_leads ADD COLUMN owner_user_id INTEGER;
