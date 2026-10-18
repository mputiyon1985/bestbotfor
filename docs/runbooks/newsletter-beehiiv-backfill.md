# Beehiiv pending subscriber backfill

Addresses saved before Beehiiv is configured stay `pending`. This script sends those rows once both `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` are set. Double opt-in stays on. The confirmation email is not skipped. The script prints counts only. It does not print addresses.

Dry-run is the default. `--production-launch` does not turn that off.

## Before apply

1. Dry run first: `npm run backfill:beehiiv`
2. Review the counts. `pending` is the number that an apply would send. `syncing` is a row already claimed and is not sent again. `failed` stays 0 on a dry run.
3. Mark approves that apply.
4. Apply: `npm run backfill:beehiiv -- --apply`

A second apply skips rows already `synced`. It does not send a `syncing` row again. If a run stops after claiming a row and before Beehiiv answers, leave that row `syncing` until someone checks Beehiiv, so the confirmation email is not sent twice.

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
