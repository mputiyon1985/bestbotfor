# Beehiiv pending subscriber backfill

Addresses saved before Beehiiv is configured stay `pending`. This script sends those rows once both `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` are set. Double opt-in stays on. The confirmation email is not skipped. The script prints counts only. It does not print addresses.

Dry-run is the default. `--production-launch` does not turn that off. A dry run counts rows. It does not select email addresses and it does not call Beehiiv.

## Before apply

1. Deploy first. Production prebuild runs `scripts/prepare-db.ts`, which applies `0020_subscriber_syncing_started.sql` and `0021_subscriber_beehiiv_status.sql` with the rest of the migrations. Do not run those files by hand. The backfill runs only after that deploy. The script reads `syncing_started_at` and writes `beehiiv_status` for a parked row.
2. Dry run first: `npm run backfill:beehiiv`
3. Review the counts. The script prints the target host before those counts. `pending` is the number that an apply would send. `syncing` is a row already claimed. It is not a subscriber and an apply does not send it. `failed` stays 0 on a dry run.
4. Mark approves that apply.
5. Apply: `npm run backfill:beehiiv -- --apply`

A second apply skips rows already `synced`. It does not post a `syncing` row.

## A row left syncing

A claim writes `syncing_started_at` before the Beehiiv call. If the process stops before the row is marked `synced` or returned to `pending`, the row stays `syncing`. It is not counted as a subscriber. A claim younger than 15 minutes is treated as still in flight. A missing `syncing_started_at` is stale.

Reconcile looks the address up with Beehiiv’s subscription-by-email GET. It does not post. Dry-run is the default, and the production gates are the same as apply.

1. Dry run first: `npm run backfill:beehiiv -- --reconcile-stuck`
2. Review `stale`. That is the number of syncing rows old enough to check. Fresh syncing rows are left alone.
3. Mark approves.
4. Apply: `npm run backfill:beehiiv -- --reconcile-stuck --apply`

When Beehiiv reports `active`, `validating`, or `pending`, the row becomes `synced` and is counted as already in Beehiiv. It is not posted. `validating` means Beehiiv is still checking the address. `pending` means double opt-in is waiting for the confirmation email. When Beehiiv reports `inactive` or `unsubscribed`, the row becomes `unsubscribed`. It is not marked `synced`, it is not counted, and reconcile does not post it. Backfill does not send `unsubscribed` rows. A person who submits the form again has given fresh consent: that one request claims the row and sends double opt-in. The success line is “Check your email to confirm.” When Beehiiv reports `invalid`, `paused`, `needs_attention`, or any other status, including a missing status, the row becomes `failed` and `beehiiv_status` stores that value. It does not stay `syncing`. The reconcile summary counts those rows as `terminal`. They are not posted, and the next reconcile does not see them. A signup for `paused` or `needs_attention` gets the same “We couldn't add you just now. Try again in a few minutes.” line as any other signup that was not added. That line does not name the Beehiiv status. When Beehiiv does not have the address, the row returns to `pending` for a later backfill apply. Those updates match the `syncing_started_at` value read before the GET. If that clock changed, someone else re-claimed the row: the update does nothing and does not post. A lookup failure leaves the row `syncing`.

A signup on a stale row takes a new clock with that same compare-and-set before it posts. The new clock has to be later than the clock it read. Only the signup that wins the new clock posts.

`--stuck-after-ms` overrides the 15 minute threshold. It has to be at least 60000 milliseconds. A smaller value is refused on the command line. The reconcile function also refuses to use a window shorter than 60000 milliseconds.

Someone who signs up while another request already holds the row is told “You're being added. Check your email to confirm.” That reply is not an error. While Beehiiv is unset, the same case says “You'll get a confirmation email when The Daily Bot launches.” A stale row is looked up the same way: `active`, `validating`, and `pending` become `synced` with no second post. `validating` means the address is being checked. `pending` is the double opt-in wait. `inactive` or `unsubscribed` stays unsubscribed with no post from reconcile. A missing address is sent once with double opt-in. A later form submit on an `unsubscribed` row is the one request that may send double opt-in again.

## Production

`0020_subscriber_syncing_started.sql` and `0021_subscriber_beehiiv_status.sql` reach production through the normal deploy prebuild. The backfill runs only after that deploy. Do not apply those files as hand-run SQL.

Production, and the production database, are refused unless both of these are set:

- `--production-launch`
- `BACKFILL_PROD_CONFIRM` equal to the confirm value

The confirm value is the `prodDbNames` entry in `config/db-guard.json`. It is not read from the database URL. The script does not print it. A refusal does not print it either. The parsed host has to equal the `prodHosts` entry in that same file. A preview database, another Turso host, or a lookalike suffix is refused. The script prints the target host before the counts.

Apply still needs `--apply`. Without it, a production launch only prints the target host and the dry-run counts.

```sh
BACKFILL_PROD_CONFIRM=<confirm value> npm run backfill:beehiiv -- --production-launch
```

After Mark approves those counts:

```sh
BACKFILL_PROD_CONFIRM=<confirm value> npm run backfill:beehiiv -- --production-launch --apply
```

A stuck-row reconcile uses the same two gates. Dry-run first:

```sh
BACKFILL_PROD_CONFIRM=<confirm value> npm run backfill:beehiiv -- --production-launch --reconcile-stuck
```

After Mark approves the stale count:

```sh
BACKFILL_PROD_CONFIRM=<confirm value> npm run backfill:beehiiv -- --production-launch --reconcile-stuck --apply
```
