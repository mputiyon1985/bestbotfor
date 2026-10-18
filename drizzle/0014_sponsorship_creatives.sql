-- Sponsor tool cards and the admin review log.
-- Numbered 0014 so it sorts after 0013_sponsorship_paid_at. Journal idx 12.
-- 0010 is unused.
--
-- A card is stored before or after payment and stays hidden until an admin
-- approves it. The audit table is append-only: a trigger aborts UPDATE and
-- DELETE. Nothing is dropped. CREATE TABLE and CREATE INDEX use IF NOT EXISTS.
-- This SQLite build rejects ADD COLUMN IF NOT EXISTS, and this file does not
-- use that syntax.

CREATE TABLE IF NOT EXISTS sponsorship_creatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsorship_id INTEGER,
  stripe_checkout_session_id TEXT,
  request_key TEXT UNIQUE,
  tool_name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  logo_mime TEXT NOT NULL,
  logo_bytes BLOB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsorship_creatives_status_idx ON sponsorship_creatives (status);
CREATE INDEX IF NOT EXISTS sponsorship_creatives_sponsorship_idx ON sponsorship_creatives (sponsorship_id);
CREATE INDEX IF NOT EXISTS sponsorship_creatives_session_idx ON sponsorship_creatives (stripe_checkout_session_id);

CREATE TABLE IF NOT EXISTS sponsorship_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creative_id INTEGER NOT NULL,
  sponsorship_id INTEGER,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsorship_review_events_creative_idx ON sponsorship_review_events (creative_id);

CREATE TRIGGER IF NOT EXISTS sponsorship_review_events_append_only_update
BEFORE UPDATE ON sponsorship_review_events
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_review_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS sponsorship_review_events_append_only_delete
BEFORE DELETE ON sponsorship_review_events
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_review_events is append-only');
END;
