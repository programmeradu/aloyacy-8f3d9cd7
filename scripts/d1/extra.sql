
-- ---------------------------------------------------------------------------
-- Replacements for Supabase-managed objects (auth schema, pgmq, vault).
-- ---------------------------------------------------------------------------

-- Own auth: one row per rider. Anonymous device users have email NULL.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  email_confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_sign_in_at TEXT
);

-- Email one-time codes (hashed). One live code per email; `user_id` is set
-- when the code links an email to an existing anonymous user.
CREATE TABLE IF NOT EXISTS auth_otp_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  user_id TEXT,
  purpose TEXT NOT NULL DEFAULT 'signin',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- WebAuthn registration/authentication challenges (short-lived).
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- pgmq replacement for the email queues (auth_emails, transactional_emails, *_dlq).
CREATE TABLE IF NOT EXISTS email_queue (
  msg_id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_name TEXT NOT NULL,
  message TEXT NOT NULL,
  read_ct INTEGER NOT NULL DEFAULT 0,
  vt INTEGER NOT NULL DEFAULT 0,
  enqueued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS email_queue_ready_idx ON email_queue (queue_name, vt, msg_id);

-- Names the code reads that never had their own table in Supabase.
CREATE VIEW IF NOT EXISTS stop_conditions AS
  SELECT stop_id, attribute, value, n, source, updated_at FROM stop_attributes;
CREATE VIEW IF NOT EXISTS user_profiles AS
  SELECT id, email FROM users WHERE email IS NOT NULL;

-- Singleton row the email queue processor expects.
INSERT OR IGNORE INTO email_send_state (id) VALUES (1);
