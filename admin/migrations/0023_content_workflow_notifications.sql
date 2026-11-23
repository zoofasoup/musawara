-- Private in-app notifications for content-workflow actions.
CREATE TABLE content_workflow_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX content_workflow_notifications_recipient ON content_workflow_notifications(recipient_user_id, read_at, id);
