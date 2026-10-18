-- Daily totals for an approved Sponsored placement.
-- Numbered 0017 so it sorts after 0016_sponsorship_card_review. Journal idx 15.
-- 0010 is unused.
--
-- One row per placement per UTC day. The only values are the placement id,
-- the day, and two counters. No IP, user agent, cookie, or user id.
-- CREATE TABLE and CREATE INDEX use IF NOT EXISTS. Nothing is dropped.
-- This SQLite build rejects ADD COLUMN IF NOT EXISTS, and this file does not
-- use that syntax.

CREATE TABLE IF NOT EXISTS sponsorship_daily_counts (
  sponsorship_id INTEGER NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  go_clicks INTEGER NOT NULL DEFAULT 0 CHECK (go_clicks >= 0),
  PRIMARY KEY (sponsorship_id, day)
);

CREATE INDEX IF NOT EXISTS sponsorship_daily_counts_day_idx ON sponsorship_daily_counts (day);
