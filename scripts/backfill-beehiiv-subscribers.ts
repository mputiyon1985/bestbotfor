import { assertSafeDbTarget } from '../src/lib/db/guard'
import { getDb } from '../src/lib/db/client'
import { backfillPendingSubscribers, newsletterBackfillAllowed, newsletterDatabaseName } from '../src/lib/newsletter-backfill'

/**
 * Dry-run unless --apply is passed. --production-launch still dry-runs until --apply.
 * Production needs both that flag and BACKFILL_PROD_CONFIRM set to the database name.
 * Beehiiv double opt-in stays on, so a confirmation email is not skipped.
 * Addresses are not printed.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const productionLaunch = process.argv.includes('--production-launch')
  const databaseUrl = process.env.TURSO_DATABASE_URL
  const decision = newsletterBackfillAllowed({
    vercelEnv: process.env.VERCEL_ENV,
    databaseUrl,
    productionLaunch,
    confirmName: process.env.BACKFILL_PROD_CONFIRM,
  })
  if (!decision.ok) {
    console.error(decision.reason)
    process.exit(1)
  }
  const url = databaseUrl?.trim() ?? ''
  if (productionLaunch) {
    console.log(`Newsletter backfill production launch confirmed for ${newsletterDatabaseName(url)}.`)
  } else {
    assertSafeDbTarget(url)
  }
  const result = await backfillPendingSubscribers({ db: getDb(), apply })
  console.log(
    JSON.stringify({
      dryRun: result.dryRun,
      pending: result.pending,
      syncing: result.syncing,
      synced: result.synced,
      failed: result.failed,
      unconfigured: result.unconfigured,
      productionLaunch,
    }),
  )
  if (apply && (result.unconfigured || result.failed > 0)) process.exit(1)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Newsletter backfill failed')
  process.exit(1)
})
