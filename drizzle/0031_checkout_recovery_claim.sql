-- Lease for an in-flight checkout recovery email. Additive. Nothing is dropped.
-- Safe to re-run: a plain ADD COLUMN, skipped when the column already exists
-- (see addColumnStatements in src/lib/db/migrate.ts). Null until a send starts.
-- recovery_email_sent_at is set only after the provider accepts the message.
-- The deploy applies this file automatically. Mark's OK is needed before merge.

ALTER TABLE sponsor_abandoned_checkouts ADD COLUMN recovery_email_claimed_at INTEGER;
