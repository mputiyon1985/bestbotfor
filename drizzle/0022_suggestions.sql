-- Private suggestion box. Additive. Nothing is dropped or deleted.
-- Production must not apply this table without Mark's OK.

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'add', 'remove')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  email TEXT,
  created_at INTEGER NOT NULL
);
