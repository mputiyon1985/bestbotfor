-- Speeds the retention scans on rate_limits.reset_at and clicks.ts.
-- Numbered 0018. 0009 is #10, 0013 is #50, 0014–0016 are #51, and 0017 is #53.
-- This file can land before those files exist. The migrator applies each
-- missing filename on its own, as 0011 and 0012 did before 0009.
-- Additive. Production prebuild applies this file. Do not merge until Mark approves.

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx ON rate_limits (reset_at);

CREATE INDEX IF NOT EXISTS clicks_ts_idx ON clicks (ts);
