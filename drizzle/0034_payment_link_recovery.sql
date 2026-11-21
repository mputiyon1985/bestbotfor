-- One Payment Link recovery email per Checkout Session. Additive.
-- The primary key is the Checkout Session id and is inserted before the send,
-- so a webhook retry cannot send a second copy. Nothing is dropped.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
-- Next free number after 0033_bbf_leads. Journal idx 32.
-- The deploy applies this file automatically: every production build,
-- including the one a merge to main triggers, runs prebuild
-- (scripts/prepare-db.ts). Mark's OK is needed before this migration is merged.
-- No buyer email belongs in this file.

CREATE TABLE IF NOT EXISTS payment_link_recovery_emails (
  stripe_checkout_session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  payment_link_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  recovery_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS payment_link_recovery_emails_email_idx
  ON payment_link_recovery_emails (email);
