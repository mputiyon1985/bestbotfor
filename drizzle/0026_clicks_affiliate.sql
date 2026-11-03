-- Affiliate reconciliation on clicks. Additive. Nothing is dropped or rewritten.
-- Safe to re-run: these are plain ADD COLUMN statements, and the migrator skips
-- a column that already exists (see addColumnStatements in src/lib/db/migrate.ts).
-- affiliate is 0 for an official-site Visit and 1 when /go used an active program.
-- program_id is affiliate_programs.tool_id for that click, or null.
-- This file does not seed or activate any program.

ALTER TABLE clicks ADD COLUMN affiliate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clicks ADD COLUMN program_id INTEGER;
