-- Unpaid sponsor checkouts that expired. Additive. Nothing is dropped.
-- Safe to re-run: CREATE TABLE/INDEX IF NOT EXISTS, and applyMigrations
-- adds any missing column after the file (src/lib/db/migrate.ts).
-- The deploy applies this file automatically: every production build,
-- including the one a merge to main triggers, runs prebuild
-- (scripts/prepare-db.ts). Mark's OK is needed before this migration is merged.

CREATE TABLE IF NOT EXISTS sponsor_abandoned_checkouts (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  offering TEXT NOT NULL,
  expired_at INTEGER NOT NULL,
  task_slug TEXT,
  source TEXT NOT NULL CHECK (source IN ('checkout', 'payment_link')),
  recovery_url TEXT,
  promotions_consent TEXT NOT NULL,
  consented_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsor_abandoned_checkouts_expired_at_idx
  ON sponsor_abandoned_checkouts (expired_at);
