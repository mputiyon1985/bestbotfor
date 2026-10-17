-- User ratings tables. Additive: new tables, indexes, and append-only triggers.
-- No DROP, ALTER, or data rewrite. BEFORE UPDATE and BEFORE DELETE name the
-- events SQLite aborts; those triggers do not change rows.
-- Safe to run more than once (IF NOT EXISTS).
--
-- reviews.latest_version_id and review_versions.review_id form a cycle, so
-- those foreign keys are DEFERRABLE. Insert both rows in one transaction.
-- tool_sponsor_links.sponsorship_id has no REFERENCES: sponsorships arrives
-- in PR #10, and a foreign key to a missing table rejects every insert.
-- ip_hmac is a keyed HMAC, never a raw IP. No email column.

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  clerk_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'held', 'published', 'rejected', 'removed', 'withdrawn')),
  published_version_id INTEGER REFERENCES review_versions(id) DEFERRABLE INITIALLY DEFERRED,
  latest_version_id INTEGER NOT NULL REFERENCES review_versions(id) DEFERRABLE INITIALLY DEFERRED,
  weight REAL NOT NULL DEFAULT 1.0 CHECK (weight IN (1.0, 1.5)),
  counts_toward_score INTEGER NOT NULL DEFAULT 1 CHECK (counts_toward_score IN (0, 1)),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  ip_hmac TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_user_tool_unique ON reviews (clerk_user_id, tool_id);
CREATE INDEX IF NOT EXISTS reviews_tool_status_published_idx ON reviews (tool_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS reviews_status_created_idx ON reviews (status, created_at);
CREATE INDEX IF NOT EXISTS reviews_ip_created_idx ON reviews (ip_hmac, created_at);

CREATE TABLE IF NOT EXISTS review_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id) DEFERRABLE INITIALLY DEFERRED,
  version_no INTEGER NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  pros TEXT NOT NULL DEFAULT '' CHECK (length(pros) <= 1000),
  cons TEXT NOT NULL DEFAULT '' CHECK (length(cons) <= 1000),
  use_case_text TEXT NOT NULL DEFAULT '' CHECK (length(use_case_text) <= 280),
  role TEXT CHECK (role IS NULL OR role IN (
    'Student',
    'Individual or freelancer',
    'Developer',
    'Designer or creative',
    'Marketer',
    'Founder or manager',
    'Educator',
    'Researcher',
    'Other'
  )),
  usage_duration TEXT CHECK (usage_duration IS NULL OR usage_duration IN (
    'Less than a month',
    '1 to 6 months',
    '6 to 12 months',
    '1 to 2 years',
    'More than 2 years'
  )),
  plan_type TEXT CHECK (plan_type IS NULL OR plan_type IN ('Free plan', 'Paid plan', 'Free trial')),
  connection TEXT NOT NULL CHECK (connection IN ('none', 'disclosed')),
  connection_text TEXT NOT NULL DEFAULT '' CHECK (
    (connection = 'none' AND connection_text = '')
    OR (connection = 'disclosed' AND length(connection_text) BETWEEN 1 AND 140)
  ),
  attestation_version TEXT NOT NULL,
  vendor_domain_check TEXT NOT NULL CHECK (vendor_domain_check IN ('pass', 'no_corporate_domain')),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected', 'superseded')),
  reason_code TEXT,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS review_versions_review_no_unique ON review_versions (review_id, version_no);

CREATE TRIGGER IF NOT EXISTS review_versions_content_append_only
BEFORE UPDATE OF stars, pros, cons, use_case_text, role, usage_duration, plan_type, connection, connection_text
ON review_versions
BEGIN
  SELECT RAISE(ABORT, 'review_versions content is append-only');
END;

CREATE TABLE IF NOT EXISTS review_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  reporter_user_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  status TEXT NOT NULL CHECK (status IN ('open', 'upheld', 'dismissed')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS review_reports_review_reporter_unique ON review_reports (review_id, reporter_user_id);
CREATE INDEX IF NOT EXISTS review_reports_status_created_idx ON review_reports (status, created_at);

CREATE TABLE IF NOT EXISTS moderation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER,
  version_id INTEGER,
  report_id INTEGER,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'admin', 'user', 'webhook')),
  actor_ref TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason_code TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at INTEGER NOT NULL,
  prev_hash TEXT,
  hash TEXT
);

CREATE TRIGGER IF NOT EXISTS moderation_events_append_only_update
BEFORE UPDATE ON moderation_events
BEGIN
  SELECT RAISE(ABORT, 'moderation_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS moderation_events_append_only_delete
BEFORE DELETE ON moderation_events
BEGIN
  SELECT RAISE(ABORT, 'moderation_events is append-only');
END;

CREATE TABLE IF NOT EXISTS review_aggregates (
  tool_id INTEGER PRIMARY KEY REFERENCES tools(id),
  published_count INTEGER NOT NULL DEFAULT 0,
  weight_total REAL NOT NULL DEFAULT 0,
  weighted_sum REAL NOT NULL DEFAULT 0,
  star_1 INTEGER NOT NULL DEFAULT 0,
  star_2 INTEGER NOT NULL DEFAULT 0,
  star_3 INTEGER NOT NULL DEFAULT 0,
  star_4 INTEGER NOT NULL DEFAULT 0,
  star_5 INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_vendor_domains (
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  domain TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('tool_url', 'manual')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tool_id, domain)
);

CREATE TABLE IF NOT EXISTS tool_sponsor_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  sponsorship_id INTEGER,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tool_sponsor_links_tool_ends_idx ON tool_sponsor_links (tool_id, ends_at);

CREATE TABLE IF NOT EXISTS user_tombstones (
  user_hmac TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);
