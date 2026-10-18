-- Refund audit for sponsor cards, and a replace guard on the review log.
-- Numbered 0016 so it sorts after 0015_sponsorship_slot_claims. Journal idx 14.
-- 0010 is unused.
--
-- Approve and reject stay in sponsorship_review_events. refund_pending and
-- refunded are recorded here so the older decision check is left as it is.
-- Version, snapshot, and refund_status columns are added by
-- adoptSponsorCardSchema. This SQLite build rejects ADD COLUMN IF NOT EXISTS,
-- and this file does not use that syntax.
-- Nothing is dropped. INSERT OR REPLACE cannot rewrite an audit row: a
-- conflicting insert deletes the old row first, and BEFORE DELETE aborts.
-- The BEFORE INSERT trigger aborts a second insert of an existing id.

CREATE TABLE IF NOT EXISTS sponsorship_refund_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creative_id INTEGER NOT NULL,
  sponsorship_id INTEGER,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('refund_pending', 'refunded')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsorship_refund_events_creative_idx ON sponsorship_refund_events (creative_id);

CREATE TRIGGER IF NOT EXISTS sponsorship_refund_events_append_only_update
BEFORE UPDATE ON sponsorship_refund_events
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_refund_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS sponsorship_refund_events_append_only_delete
BEFORE DELETE ON sponsorship_refund_events
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_refund_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS sponsorship_refund_events_no_replace
BEFORE INSERT ON sponsorship_refund_events
WHEN EXISTS (
  SELECT 1 FROM sponsorship_refund_events AS existing WHERE existing.id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_refund_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS sponsorship_review_events_no_replace
BEFORE INSERT ON sponsorship_review_events
WHEN EXISTS (
  SELECT 1 FROM sponsorship_review_events AS existing WHERE existing.id = NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'sponsorship_review_events is append-only');
END;
