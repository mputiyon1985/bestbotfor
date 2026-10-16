-- Sponsor checkout records. stripe_events is the idempotency table from
-- 0001_init.sql, keyed by the Stripe event id. Creating it again is a no-op
-- on databases that already applied 0001.
-- Filename is 0009 so it sorts after 0008_ratings_v23.sql.
-- Main already uses 0005 through 0008.
--
-- ADOPT the sponsorships table from the unguarded #10 preview (66d41ea,
-- 8:51 AM ET on 2026-10-16). That preview created this table and
-- sponsorships_status_idx, and recorded schema_migrations.id =
-- '0005_sponsorships.sql'. The statements below are that same DDL.
-- CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS keep an existing
-- table, index, and rows. They do not add a column when the table is already
-- there, so applyMigrations then adds any column from src/lib/db/schema.ts
-- that is missing, and creates the status index when it is missing.
-- This file does not DROP, ALTER, UPDATE, or DELETE. The stray ledger row is
-- not removed: the migrator only runs drizzle/*.sql files and does not look
-- up ledger ids that have no file.
-- No card numbers, PANs, or payment-method payloads are stored.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  offering TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  email TEXT,
  company TEXT,
  task_slug TEXT,
  issue_date TEXT,
  amount_total INTEGER,
  currency TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsorships_status_idx ON sponsorships (status);
