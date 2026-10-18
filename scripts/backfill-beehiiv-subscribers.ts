import { assertSafeDbTarget } from '../src/lib/db/guard'
import { getDb } from '../src/lib/db/client'
import { backfillPendingSubscribers, newsletterBackfillAllowed } from '../src/lib/newsletter'

/**
 * Dry-run unless --apply is passed. Refuses production. Does not print addresses.
 * Beehiiv double opt-in stays on, so a confirmation email is not skipped.
 */
async function main(): Promise<void> {
  const decision = newsletterBackfillAllowed({
    vercelEnv: process.env.VERCEL_ENV,
    databaseUrl: process.env.TURSO_DATABASE_URL,
  })
  if (!decision.ok) {
    console.error(decision.reason)
    process.exit(1)
  }
  assertSafeDbTarget(process.env.TURSO_DATABASE_URL?.trim() ?? '')
  const apply = process.argv.includes('--apply')
  const result = await backfillPendingSubscribers({ db: getDb(), apply })
  console.log(
    JSON.stringify({
      dryRun: result.dryRun,
      pending: result.pending,
      synced: result.synced,
      failed: result.failed,
      unconfigured: result.unconfigured,
    }),
  )
  if (apply && (result.unconfigured || result.failed > 0)) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Newsletter backfill failed')
  process.exit(1)
})
