-- One recovery-email claim per address, shared by the in-app sender and the
-- Payment Link sender. Additive. Nothing is dropped.
-- status is claimed, sent, or failed. A failed row is a Resend 4xx and is
-- outside the 7-day window. send_status on payment_link_recovery_emails is
-- the same three values for that session.
-- Safe to re-run the table. The column add is one plain ALTER, skipped when
-- the column is already present only if this file is split; a mixed file
-- runs once through the ledger. The adopt step adds a missing send_status.
-- Next free number after 0034_payment_link_recovery. Journal idx 33.
-- The deploy applies this file automatically. Mark's OK is needed before merge.

CREATE TABLE IF NOT EXISTS checkout_recovery_address_claims (
  email TEXT PRIMARY KEY,
  stripe_checkout_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  sent_at INTEGER
);

ALTER TABLE payment_link_recovery_emails ADD COLUMN send_status TEXT;
