# Data retention cron

The job is `GET /api/cron/data-retention`. Vercel Cron calls it every day at 08:17 UTC (`17 8 * * *` in `vercel.json`). Production will call it after this deploys. The call does not write until Mark turns the production constant on in a later pull request.

## What it changes

- `rate_limits`: delete a row when `reset_at` is more than 24 hours in the past. The delete does not look at the key, so rows left behind when the rate-limit HMAC key changed are included. Quiz `/result` rows are not in this table.
- `result_rate_windows`: delete a row when `expires_at` is more than 24 hours in the past. `consumeResultRateLimit` writes these rows. The in-request purge can remove a window as soon as it closes. This job is the later pass for any window still present a day after `expires_at`. The bucket is not read into the log.
- `clicks`: keep the row. Set `ip_hash` to null when `ts` is more than 90 days in the past and the hash is still set. `tool_id`, `page`, `ts`, and `country` stay.

Each statement is limited to 500 rows, and one invocation runs at most 40 batches per table. The deleted and cleared counts are the rows those statements changed. `truncated: true` means a change total is lower than the eligible count, so the next run continues. Running it again after the tables are caught up changes nothing.

Before the first write, the job checks two things. The open client has to be the database named by `TURSO_DATABASE_URL`, and that URL has to be allowed for `VERCEL_ENV` (a local `file:` database, or a remote host the database guard allows). `rate_limits`, `result_rate_windows`, and `clicks` have to contain the columns the statements use. If either check fails, the response and the log contain the eligible counts, `wrote` is false, and nothing is deleted. The log does not include the URL or the host.

`0018_retention_indexes.sql` adds indexes on `rate_limits.reset_at` and `clicks.ts`. `0009` and `0013`–`0017` belong to open sponsor pull requests, so this file is numbered after them. The migrator applies it even when those files are not on disk yet, and still applies them later. Production prebuild applies this migration. It needs Mark's OK before it merges.

## What it does not change

It does not edit the privacy policy. It does not delete click rows. It does not read or write review `ip_hmac` or `net_hmac`. It does not log rate-limit keys, result-window buckets, IP hashes, or addresses.

## Locks

All three have to be open before a write:

1. `CRON_SECRET` is at least 32 characters, and the request is `GET` with `Authorization: Bearer` set to that exact value. The secret is not trimmed. A missing, shorter, or wrong secret returns 401 and does not open the database. `HEAD` returns 405 and does not run the job. Vercel sends the bearer header for Cron when the variable is set. Setting the secret does not enable writes.
2. `DATA_RETENTION_PURGE` is exactly `on`, and `VERCEL_ENV` is exactly `preview`, `development`, or `test`. An unset or unknown `VERCEL_ENV` is off. `NODE_ENV` is not read. In production the job stays off until `DATA_RETENTION_PRODUCTION_LAUNCH` in `src/lib/retention-flags.ts` is true. That constant ships false.
3. `DATA_RETENTION_DRY_RUN` is exactly `off`. Any other value, including unset, is a dry run: the response and the log contain counts, and nothing is written.

A disabled or dry-run response is HTTP 200 with `Cache-Control: no-store`. The log is one JSON line:

```json
{"event":"data_retention","enabled":false,"dryRun":true,"wrote":false,"rateLimitsEligible":0,"rateLimitsDeleted":0,"resultWindowsEligible":0,"resultWindowsDeleted":0,"clickHashesEligible":0,"clickHashesCleared":0,"truncated":false}
```

## How to try it

Use a local `file:` database only. Do not point `TURSO_DATABASE_URL` at production.

`CRON_SECRET` must already be exported and at least 32 characters. A shorter value is refused.

```bash
TURSO_DATABASE_URL=file:./data/retention.db TURSO_AUTH_TOKEN=local npm run build
DATA_RETENTION_PURGE=on VERCEL_ENV=test \
  TURSO_DATABASE_URL=file:./data/retention.db TURSO_AUTH_TOKEN=local \
  npm start
curl -sS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/data-retention
```

Leave `DATA_RETENTION_DRY_RUN` unset for that curl. The JSON shows counts and `wrote` is false. Repeat the curl and confirm the counts do not change because nothing was deleted.

To write on that same local file, stop the server and start it again with `DATA_RETENTION_DRY_RUN=off`.

## Later production enablement

Mark has to approve that pull request. It sets `DATA_RETENTION_PRODUCTION_LAUNCH` to true and nothing else. After that constant is true, a production write also needs `DATA_RETENTION_PURGE=on` and `DATA_RETENTION_DRY_RUN=off`. Until the constant is true, setting those two variables does not make production write. A production cron is 401 when `CRON_SECRET` is missing or shorter than 32 characters, and 200 with `enabled: false` otherwise.

The privacy policy (#58) has to be updated with or before the first writing run. That update has to say rate-limit rows are deleted 24–48 hours after the window ends, click IP hashes are removed after about 90 days, and how long Turso backups keep the previous rows. The local file steps above do not replace that update.
