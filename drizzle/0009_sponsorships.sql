-- Sponsor checkout records. stripe_events is the idempotency table from
-- 0001_init.sql, keyed by the Stripe event id. Creating it again is a no-op
-- on databases that already applied 0001.
-- Filename is 0009 so it sorts after 0008_ratings_v23.sql.
-- Main already uses 0005 through 0008.
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
