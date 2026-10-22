-- Fixed window for /result. The bucket is a hash of the client key and the
-- window start, so the raw IP is not stored. Old windows are deleted by the
-- app after the response. Additive: create table and index only.
-- Numbered 0012 so it sorts after 0009_sponsorships (PR #10) and
-- 0011_user_reviews (PR #32). Journal idx 10. 0010 is unused.

CREATE TABLE IF NOT EXISTS result_rate_windows (
  bucket TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS result_rate_windows_expires_idx ON result_rate_windows (expires_at);
