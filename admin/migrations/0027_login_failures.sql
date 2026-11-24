-- Failed sign-ins per e-mail address (whether or not the account exists, so the count tells an attacker nothing).
-- Eight failures in 15 minutes pause sign-in for that address; a good sign-in clears them.
CREATE TABLE login_failures (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  at    INTEGER NOT NULL   -- ms since epoch
);
CREATE INDEX idx_login_failures_email_at ON login_failures (email, at);
