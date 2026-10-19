-- Private suggestion box. Additive. Nothing is dropped or deleted.
-- The production deploy applies this file automatically: the build's prebuild
-- (scripts/prepare-db.ts) runs every unapplied drizzle/*.sql file, so merging
-- the PR to main is what applies it. Mark's OK is needed before merge.
-- Applied in production on the d7b1978 deploy (#86), 2026-10-18 7:40 PM ET.

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'add', 'remove')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  email TEXT,
  created_at INTEGER NOT NULL
);
