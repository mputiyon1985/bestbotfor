-- Addresses that opted out of checkout recovery email. Additive. Nothing is dropped.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS. The 90-day abandoned-checkout
-- purge does not delete these rows.
-- The deploy applies this file automatically. Mark's OK is needed before merge.

CREATE TABLE IF NOT EXISTS checkout_recovery_suppressions (
  email TEXT PRIMARY KEY,
  suppressed_at INTEGER NOT NULL,
  source TEXT NOT NULL
);
