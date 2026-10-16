-- Fixed window for /result. The bucket is a hash of the client key and the
-- window start, so the raw IP is not stored. Old windows are deleted by the
-- app after the response. Additive: create table and index only.

CREATE TABLE IF NOT EXISTS result_rate_windows (
  bucket TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS result_rate_windows_expires_idx ON result_rate_windows (expires_at);
