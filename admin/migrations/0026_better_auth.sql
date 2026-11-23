-- Better Auth tables, laid over the existing users table (integer ids, our own role columns).
-- users.password_hash stays in place: it is what the previous version of the app reads, so a rollback needs no data move.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;   -- accounts here were created by invite or bootstrap, never self-signup
ALTER TABLE users ADD COLUMN image TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE session (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session (userId);

CREATE TABLE account (
  id TEXT NOT NULL PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX account_userId_idx ON account (userId);

CREATE TABLE verification (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification (identifier);

CREATE TABLE twoFactor (
  id TEXT NOT NULL PRIMARY KEY,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verified INTEGER,
  failedVerificationCount INTEGER,
  lockedUntil TEXT
);
CREATE INDEX twoFactor_secret_idx ON twoFactor (secret);
CREATE INDEX twoFactor_userId_idx ON twoFactor (userId);

-- Sign-in attempts counted per key (IP + path), in the database because Workers have no shared memory.
CREATE TABLE rateLimit (
  id TEXT NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

-- Today's passwords become credential accounts as they are (the pbkdf2 format is verified by our own hasher).
INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
SELECT 'legacy-' || id, CAST(id AS TEXT), 'credential', CAST(id AS TEXT), password_hash, COALESCE(created_at, datetime('now')), datetime('now') FROM users;
