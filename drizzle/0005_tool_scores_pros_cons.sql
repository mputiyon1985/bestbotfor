-- Additive editorial tables. Safe to run more than once.
-- tool_scores is one row per tool. tool_pros_cons is one row per point.
-- The seed only upserts, so rows for tools that are not in the seed stay in place.

CREATE TABLE IF NOT EXISTS tool_scores (
  tool_id INTEGER PRIMARY KEY,
  features REAL NOT NULL,
  value REAL NOT NULL,
  ease REAL NOT NULL,
  quality REAL NOT NULL,
  overall REAL NOT NULL,
  rationale TEXT NOT NULL,
  sources TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  CHECK (features >= 0 AND features <= 5),
  CHECK (value >= 0 AND value <= 5),
  CHECK (ease >= 0 AND ease <= 5),
  CHECK (quality >= 0 AND quality <= 5),
  CHECK (overall >= 0 AND overall <= 5)
);

CREATE TABLE IF NOT EXISTS tool_pros_cons (
  tool_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  position INTEGER NOT NULL,
  body TEXT NOT NULL,
  source_url TEXT NOT NULL,
  PRIMARY KEY (tool_id, kind, position),
  CHECK (kind IN ('pro', 'con')),
  CHECK (position >= 1 AND position <= 3)
);
