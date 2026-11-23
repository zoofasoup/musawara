-- Roles. users.role stays the audience (admin = team, client = portal); the finer role sits beside it.
--   staff_role  owner | ads | content | crm   (team members)
--   client_role viewer | approver             (client logins)
-- Staff below owner only reach the clients assigned to them in user_clients.
ALTER TABLE users ADD COLUMN staff_role TEXT CHECK (staff_role IN ('owner','ads','content','crm'));
ALTER TABLE users ADD COLUMN client_role TEXT CHECK (client_role IN ('viewer','approver'));

CREATE TABLE user_clients (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_id)
);

ALTER TABLE invites ADD COLUMN staff_role TEXT CHECK (staff_role IN ('owner','ads','content','crm'));
ALTER TABLE invites ADD COLUMN client_role TEXT CHECK (client_role IN ('viewer','approver'));
ALTER TABLE invites ADD COLUMN client_ids_json TEXT;

-- Everyone who exists today keeps exactly what they have: admins become owners, client logins keep deciding approvals.
UPDATE users SET staff_role = 'owner' WHERE role = 'admin';
UPDATE users SET client_role = 'approver' WHERE role = 'client';
-- Invites not yet used keep working with the same access they were promising.
UPDATE invites SET staff_role = 'owner' WHERE role = 'admin' AND used = 0;
UPDATE invites SET client_role = 'approver' WHERE role = 'client' AND used = 0;
