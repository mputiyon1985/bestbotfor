-- First-touch attribution on a newsletter signup (PR B, Oct 19, 2026).
-- PROD SCHEMA CHANGE: Mark approved it on Oct 19, 2026, at 8:46 AM ET. The Vercel
-- build runs prepare-db, which applies pending migrations to the target database.
-- Additive and nullable. Nothing is dropped or rewritten. Values come from #101's
-- sanitized first-touch record and are written only when a row is inserted.
-- Re-runnable: the runner applies an ADD COLUMN-only file one statement at a time
-- and skips a column that already exists (see addColumnStatements in migrate.ts).

ALTER TABLE subscribers ADD COLUMN utm_source TEXT;
ALTER TABLE subscribers ADD COLUMN utm_medium TEXT;
ALTER TABLE subscribers ADD COLUMN utm_campaign TEXT;
ALTER TABLE subscribers ADD COLUMN utm_content TEXT;
ALTER TABLE subscribers ADD COLUMN landing_path TEXT;
