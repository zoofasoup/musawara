-- Agency operations: onboarding checklist per client, project board tasks.
CREATE TABLE IF NOT EXISTS onboarding_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,
  done_at   TEXT,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_items(client_id, sort);

CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done')),
  assignee   TEXT,
  due_date   TEXT, -- YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_client_status ON tasks(client_id, status);
