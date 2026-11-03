-- Random click id for affiliate SubIDs. Additive. Nothing is dropped.
-- Safe to re-run: a plain ADD COLUMN, skipped when public_id already exists
-- (see addColumnStatements in src/lib/db/migrate.ts).
-- The value is not the sequential clicks.id. Older rows stay null.

ALTER TABLE clicks ADD COLUMN public_id TEXT;
