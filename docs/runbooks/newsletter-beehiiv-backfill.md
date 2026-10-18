# Beehiiv pending subscriber backfill

Addresses saved before Beehiiv is configured stay `pending`. This script sends those rows once both `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` are set. Double opt-in stays on. The confirmation email is not skipped. The script prints counts only. It does not print addresses.

Dry-run is the default. `--production-launch` does not turn that off.

## Before apply

1. Dry run first: `npm run backfill:beehiiv`
2. Review the counts. `pending` is the number that an apply would send. `syncing` is a row already claimed. It is not a subscriber and an apply does not send it. `failed` stays 0 on a dry run.
3. Mark approves that apply.
4. Apply: `npm run backfill:beehiiv -- --apply`

A second apply skips rows already `synced`. It does not post a `syncing` row.

## A row left syncing

A claim writes `syncing_started_at` before the Beehiiv call. If the process stops before the row is marked `synced` or returned to `pending`, the row stays `syncing`. It is not counted as a subscriber. A claim younger than 15 minutes is treated as still in flight. A missing `syncing_started_at` is stale.

Reconcile looks the address up with Beehiiv’s subscription-by-email GET. It does not post. Dry-run is the default, and the production gates are the same as apply.

1. Dry run first: `npm run backfill:beehiiv -- --reconcile-stuck`
2. Review `stale`. That is the number of syncing rows old enough to check. Fresh syncing rows are left alone.
3. Mark approves.
4. Apply: `npm run backfill:beehiiv -- --reconcile-stuck --apply`

When Beehiiv already has the address, the row becomes `synced` and is not posted. When Beehiiv does not have it, the row returns to `pending` for a later backfill apply. A lookup failure leaves the row `syncing`.

`--stuck-after-ms` overrides the 15 minute threshold. It is a positive number of milliseconds.

Someone who signs up again while the row is still fresh is asked to try again in a few minutes. A stale row is looked up the same way: found becomes `synced` with no second post, and missing is sent once with double opt-in.

## Production

Production, and the production database, are refused unless both of these are set:

- `--production-launch`
- `BACKFILL_PROD_CONFIRM` equal to the database name

The database name is the first label of the Turso host. For the production host that is `agentic-ai-co-mputiyon1985`. A local file uses its file name, such as `test.db`.

Apply still needs `--apply`. Without it, a production launch only prints the dry-run counts.

```sh
BACKFILL_PROD_CONFIRM=agentic-ai-co-mputiyon1985 npm run backfill:beehiiv -- --production-launch
```

After Mark approves those counts:

```sh
BACKFILL_PROD_CONFIRM=agentic-ai-co-mputiyon1985 npm run backfill:beehiiv -- --production-launch --apply
```

A stuck-row reconcile uses the same two gates. Dry-run first:

```sh
BACKFILL_PROD_CONFIRM=agentic-ai-co-mputiyon1985 npm run backfill:beehiiv -- --production-launch --reconcile-stuck
```

After Mark approves the stale count:

```sh
BACKFILL_PROD_CONFIRM=agentic-ai-co-mputiyon1985 npm run backfill:beehiiv -- --production-launch --reconcile-stuck --apply
```
