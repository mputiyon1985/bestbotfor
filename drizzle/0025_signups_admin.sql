-- Signups admin state on the site database. Additive. Nothing is dropped.
-- Sessions, used authenticator steps, and login-attempt counters.
-- The deploy applies this file automatically: every production build,
-- including the one a merge to main triggers, runs prebuild
-- (scripts/prepare-db.ts). Mark's OK is needed before this migration is merged.
-- This is not the read-only signups Turso database.

CREATE TABLE IF NOT EXISTS signups_sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  secret_tag TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signups_totp_steps (
  step INTEGER PRIMARY KEY,
  used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signups_login_attempts (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
