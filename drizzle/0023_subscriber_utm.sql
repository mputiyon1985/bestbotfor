-- First-touch attribution on a newsletter signup (PR B, Oct 19, 2026).
-- PROD SCHEMA CHANGE: needs Mark's OK before merge. The Vercel build runs
-- prepare-db, which applies pending migrations to the target database.
-- Additive and nullable. Nothing is dropped or rewritten.

ALTER TABLE subscribers ADD COLUMN utm_source TEXT;
ALTER TABLE subscribers ADD COLUMN utm_medium TEXT;
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT;
ALTER TABLE subscribers ADD COLUMN utm_content TEXT;
ALTER TABLE subscribers ADD COLUMN landing_path TEXT;
