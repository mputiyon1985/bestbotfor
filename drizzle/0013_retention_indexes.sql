-- Speeds the retention scans on rate_limits.reset_at and clicks.ts.
-- Additive. Production prebuild applies this file. Do not merge until Mark approves.

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);

CREATE INDEX IF NOT EXISTS clicks_ts_idx ON clicks (ts);
