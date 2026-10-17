# Data retention cron

The job is `GET /api/cron/data-retention`. Vercel Cron calls it every day at 08:17 UTC (`17 8 * * *` in `vercel.json`). Production will call it after this deploys. The call does not write until Mark turns the production constant on in a later pull request.

## What it changes

- `rate_limits`: delete a row when `reset_at` is more than 24 hours in the past. The delete does not look at the key, so rows left behind when the rate-limit HMAC key changed are included. Quiz `/result` rows are not in this table.
- `result_rate_windows`: delete a row when `expires_at` is more than 24 hours in the past. `consumeResultRateLimit` writes these rows. The in-request purge can remove a window as soon as it closes. This job is the later pass for any window still present a day after `expires_at`. The bucket is not read into the log.
- `clicks`: keep the row. Set `ip_hash` to null when `ts` is more than 90 days in the past and the hash is still set. `tool_id`, `page`, `ts`, and `country` stay.

Each statement is limited to 500 rows, and one invocation runs at most 40 batches per table. A response with `truncated: true` means the next run continues. Running it again after the tables are caught up changes nothing.

## What it does not change

It does not edit the privacy policy. It does not delete click rows. It does not read or write review `ip_hmac` or `net_hmac`. It does not log rate-limit keys, result-window buckets, IP hashes, or addresses.

## Locks

All three have to be open before a write:

1. `CRON_SECRET` is set and the request sends `Authorization: Bearer <CRON_SECRET>`. A missing or wrong secret returns 401 and does not open the database. Vercel sends this header for Cron when the variable is set. Setting the secret does not enable writes.
2. `DATA_RETENTION_PURGE` is exactly `on`, and `VERCEL_ENV` is exactly `preview`, `development`, or `test`. An unset or unknown `VERCEL_ENV` is off. `NODE_ENV` is not read. In production the job stays off until `DATA_RETENTION_PRODUCTION_LAUNCH` in `src/lib/retention-flags.ts` is true. That constant ships false.
3. `DATA_RETENTION_DRY_RUN` is exactly `off`. Any other value, including unset, is a dry run: the response and the log contain counts, and nothing is written.

A disabled or dry-run response is HTTP 200 with `Cache-Control: no-store`. The log is one JSON line:

```json
{"event":"data_retention","enabled":false,"dryRun":true,"wrote":false,"rateLimitsEligible":0,"rateLimitsDeleted":0,"resultWindowsEligible":0,"resultWindowsDeleted":0,"clickHashesEligible":0,"clickHashesCleared":0,"truncated":false}
```

## How to try it

Use a local `file:` database only. Do not point `TURSO_DATABASE_URL` at production.

```bash
TURSO_DATABASE_URL=file:./data/retention.db TURSO_AUTH_TOKEN=local npm run build
CRON_SECRET=local-cron-secret DATA_RETENTION_PURGE=on VERCEL_ENV=test \
  TURSO_DATABASE_URL=file:./data/retention.db TURSO_AUTH_TOKEN=local \
  npm start
curl -sS -H "Authorization: Bearer local-cron-secret" http://127.0.0.1:3000/api/cron/data-retention
```

Leave `DATA_RETENTION_DRY_RUN` unset for that curl. The JSON shows counts and `wrote` is false. Repeat the curl and confirm the counts do not change because nothing was deleted.

To write on that same local file, stop the server and start it again with `DATA_RETENTION_DRY_RUN=off`. Do not add that variable in the Vercel production environment.

## Later production enablement

Mark has to approve that pull request. It sets `DATA_RETENTION_PRODUCTION_LAUNCH` to true and nothing else. Production still needs `DATA_RETENTION_PURGE=on` and `DATA_RETENTION_DRY_RUN=off` before the daily cron writes. Until that pull request, a production cron is either 401 (no `CRON_SECRET`) or 200 with `enabled: false`.
