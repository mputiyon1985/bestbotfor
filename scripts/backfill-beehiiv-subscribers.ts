import { assertSafeDbTarget, dbHost } from '../src/lib/db/guard'
import { getDb } from '../src/lib/db/client'
import {
  backfillPendingSubscribers,
  newsletterBackfillAllowed,
  readStuckAfterMs,
  reconcileStuckSubscribers,
} from '../src/lib/newsletter-backfill'

/**
 * Dry-run unless --apply is passed. --production-launch and --reconcile-stuck
 * still dry-run until --apply. Production needs both that flag and
 * BACKFILL_PROD_CONFIRM set to the confirm value in config/db-guard.json.
 * Beehiiv double opt-in stays on, so a confirmation email is not skipped.
 * Addresses are not printed. The target host is printed before the counts.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const productionLaunch = process.argv.includes('--production-launch')
  const reconcile = process.argv.includes('--reconcile-stuck')
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
  let staleAfterMs = 0
  if (reconcile) {
    try {
      staleAfterMs = readStuckAfterMs(process.argv)
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Newsletter backfill failed')
      process.exit(1)
    }
  }
  const url = databaseUrl?.trim() ?? ''
  if (!productionLaunch) assertSafeDbTarget(url)
  const host = dbHost(url)
  console.log(`Newsletter backfill target host ${host ?? 'local file'}.`)
  if (reconcile) {
    const result = await reconcileStuckSubscribers({ db: getDb(), apply, staleAfterMs })
    console.log(
      JSON.stringify({
        mode: 'reconcile',
        dryRun: result.dryRun,
        stale: result.stale,
        synced: result.synced,
        released: result.released,
        optedOut: result.optedOut,
        terminal: result.terminal,
        failed: result.failed,
        unconfigured: result.unconfigured,
        productionLaunch,
      }),
    )
    if (apply && (result.unconfigured || result.failed > 0)) process.exit(1)
    return
  }
  const result = await backfillPendingSubscribers({ db: getDb(), apply })
  console.log(
    JSON.stringify({
      mode: 'backfill',
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
