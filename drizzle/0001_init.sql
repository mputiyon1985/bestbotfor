CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL,
  short_desc TEXT NOT NULL,
  long_desc TEXT NOT NULL,
  pricing_model TEXT NOT NULL,
  price_from_usd INTEGER,
  has_free_tier INTEGER NOT NULL,
  skill_level TEXT NOT NULL,
  platforms TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_tasks (
  tool_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  fit_score INTEGER NOT NULL,
  notes TEXT NOT NULL,
  PRIMARY KEY (tool_id, task_id)
);

CREATE TABLE IF NOT EXISTS affiliate_programs (
  tool_id INTEGER PRIMARY KEY,
  has_program INTEGER NOT NULL,
  network TEXT,
  source_url TEXT,
  status TEXT NOT NULL,
  affiliate_url TEXT,
  commission_note TEXT,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL,
  page TEXT NOT NULL,
  ts INTEGER NOT NULL,
  country TEXT,
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  destination TEXT NOT NULL,
  beehiiv_id TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_user_id TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL,
  current_period_end INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (clerk_user_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_user_id TEXT NOT NULL,
  task_slug TEXT NOT NULL,
  budget TEXT NOT NULL,
  skill TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS saved_picks_user_idx ON saved_picks (clerk_user_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
