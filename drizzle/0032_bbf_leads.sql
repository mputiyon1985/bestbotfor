-- Private leads for the password-gated /admin/leads page. Additive.
-- Existing tables stay as they are. Safe to re-run.
-- Next free number after main 26a6d4f (#191), which owns 0029-0031.
-- Journal idx 30. Tag 0032_bbf_leads.
-- The deploy applies this file automatically: every production build,
-- including the one a merge to main triggers, runs prebuild
-- (scripts/prepare-db.ts). Mark's OK is needed before this migration is merged.
-- No lead emails belong in this file.

CREATE TABLE IF NOT EXISTS bbf_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  type TEXT NOT NULL,
  first_contact TEXT,
  last_touch TEXT,
  touches INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  next_step TEXT,
  next_date TEXT,
  notes TEXT,
  amount_closed_usd REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(company) BETWEEN 1 AND 200),
  CHECK (length(contact_email) BETWEEN 3 AND 254),
  CHECK (length(type) BETWEEN 1 AND 64),
  CHECK (status IN ('contacted', 'replied', 'affiliate_approved', 'declined', 'bounced', 'closed')),
  CHECK (touches >= 0),
  CHECK (next_step IS NULL OR length(next_step) <= 280),
  CHECK (notes IS NULL OR length(notes) <= 4000),
  CHECK (amount_closed_usd IS NULL OR amount_closed_usd >= 0)
);

-- Unique key used by upserts. Emails are stored lowercased by the app.
CREATE UNIQUE INDEX IF NOT EXISTS bbf_leads_contact_email_key ON bbf_leads (contact_email);

CREATE INDEX IF NOT EXISTS bbf_leads_status_idx ON bbf_leads (status);
