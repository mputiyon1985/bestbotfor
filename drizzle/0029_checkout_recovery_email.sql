-- One recovery email per expired Checkout Session. Additive. Nothing is dropped.
-- Safe to re-run: a plain ADD COLUMN, skipped when the column already exists
-- (see addColumnStatements in src/lib/db/migrate.ts).
-- Null until the expired-session handler claims the send. The deploy applies
-- this file automatically: every production build, including the one a merge
-- to main triggers, runs prebuild (scripts/prepare-db.ts). Mark's OK is
-- needed before this migration is merged.

ALTER TABLE sponsor_abandoned_checkouts ADD COLUMN recovery_email_sent_at INTEGER;
