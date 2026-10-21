-- Member deal codes (Oct 21, 2026). Mark approved the feature via James.
-- PROD SCHEMA CHANGE: do NOT merge until Mark confirms the prod migration directly.
-- The Vercel build runs prepare-db, which applies pending drizzle/*.sql files to the
-- target database, so merging to main applies this table in production.
-- Additive: one new table and one index. Nothing is dropped or rewritten. No rows are seeded.

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  vendor TEXT NOT NULL,
  title TEXT NOT NULL,
  discount_text TEXT NOT NULL,
  code TEXT,
  deal_url TEXT,
  terms TEXT,
  starts_at INTEGER,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS deals_tool_slug_idx ON deals (tool_slug);
