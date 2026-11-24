-- CRM pipeline and custom fields. Contacts themselves live in the WhatsApp gateway; everything here is keyed by
-- (wa_account_id = the gateway's number id, phone) so it follows the number and its contact, and is covered by D1 backups.

CREATE TABLE crm_stages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id INTEGER NOT NULL,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT 'neutral' CHECK (color IN ('neutral','blue','violet','amber','green','rose')),
  kind          TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('open','won','lost')),
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wa_account_id, name)
);
CREATE INDEX idx_crm_stages_account ON crm_stages (wa_account_id, position);

-- One card on the board per contact: which stage, what it is worth, when it should close.
CREATE TABLE crm_leads (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id    INTEGER NOT NULL,
  phone            TEXT NOT NULL,
  stage_id         INTEGER NOT NULL REFERENCES crm_stages (id),
  value_idr        INTEGER CHECK (value_idr IS NULL OR value_idr >= 0),
  expected_close   TEXT,
  stage_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wa_account_id, phone)
);
CREATE INDEX idx_crm_leads_stage ON crm_leads (stage_id);

-- Every stage change, for "how long in a stage" and conversion numbers later.
CREATE TABLE crm_stage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id INTEGER NOT NULL,
  phone         TEXT NOT NULL,
  from_stage_id INTEGER,
  to_stage_id   INTEGER NOT NULL,
  user_id       INTEGER,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_crm_events_contact ON crm_stage_events (wa_account_id, phone, id);

CREATE TABLE crm_field_defs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_account_id INTEGER NOT NULL,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('text','number','date','select','checkbox','url')),
  options_json  TEXT,                       -- select: ["A","B"]
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wa_account_id, label)
);

CREATE TABLE crm_field_values (
  wa_account_id INTEGER NOT NULL,
  phone         TEXT NOT NULL,
  field_id      INTEGER NOT NULL REFERENCES crm_field_defs (id) ON DELETE CASCADE,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wa_account_id, phone, field_id)
);
