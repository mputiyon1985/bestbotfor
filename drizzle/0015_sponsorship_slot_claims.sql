-- One checkout hold per task page.
-- Numbered 0015 so it sorts after 0014_sponsorship_creatives. Journal idx 13.
-- 0010 is unused.
--
-- A featured placement whose week or month overlaps a paid, unrefunded
-- placement on the same task is refused. A pending checkout holds the task
-- until the Stripe session expires (24 hours). The row stores the task, the
-- form request key, the offering, and the claim time. It does not store an
-- email, an IP address, or a user id.
-- Nothing is dropped. CREATE TABLE uses IF NOT EXISTS.
-- This file does not use ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS sponsorship_slot_claims (
  task_slug TEXT PRIMARY KEY,
  request_key TEXT NOT NULL,
  offering TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);
