import { NextResponse } from 'next/server'
import type { Client } from '@libsql/client'
import { getDb, type Database } from '@/lib/db/client'
import {
  RETENTION_BATCH_SIZE,
  RETENTION_MAX_BATCHES,
  clickHashCutoff,
  decideRetentionRequest,
  rateLimitCutoff,
  resultWindowCutoff,
  retentionLogLine,
  type RetentionEnv,
  type RetentionReport,
} from '@/lib/data-retention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
}

type RetentionClient = Pick<Database, '$client'>

function countOf(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? count : 0
}

async function countRows(client: Client, sql: string, cutoff: number): Promise<number> {
  const result = await client.execute({ sql, args: [cutoff] })
  return countOf(result.rows[0]?.n)
}

/**
 * Deletes by window end only. Rows left under a previous HMAC key are included.
 * Quiz /result rows are not in this table. The key is never selected.
 */
async function deleteExpiredRateLimits(
  client: Client,
  cutoff: number,
  batchSize: number,
  maxBatches: number,
): Promise<number> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await client.execute({
      sql: `DELETE FROM rate_limits WHERE "key" IN (
        SELECT "key" FROM rate_limits WHERE reset_at < ? LIMIT ?
      )`,
      args: [cutoff, batchSize],
    })
    const affected = countOf(result.rowsAffected)
    deleted += affected
    if (affected < batchSize) break
  }
  return deleted
}

/**
 * Quiz /result rows written by consumeResultRateLimit. Eligible once expires_at
 * is more than 24 hours ago. The bucket is never selected.
 */
async function deleteExpiredResultWindows(
  client: Client,
  cutoff: number,
  batchSize: number,
  maxBatches: number,
): Promise<number> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await client.execute({
      sql: `DELETE FROM result_rate_windows WHERE bucket IN (
        SELECT bucket FROM result_rate_windows WHERE expires_at < ? LIMIT ?
      )`,
      args: [cutoff, batchSize],
    })
    const affected = countOf(result.rowsAffected)
    deleted += affected
    if (affected < batchSize) break
  }
  return deleted
}

/** Clears ip_hash and leaves the click row. The hash is never selected. */
async function clearOldClickHashes(
  client: Client,
  cutoff: number,
  batchSize: number,
  maxBatches: number,
): Promise<number> {
  let cleared = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await client.execute({
      sql: `UPDATE clicks SET ip_hash = NULL WHERE id IN (
        SELECT id FROM clicks WHERE ts < ? AND ip_hash IS NOT NULL LIMIT ?
      )`,
      args: [cutoff, batchSize],
    })
    const affected = countOf(result.rowsAffected)
    cleared += affected
    if (affected < batchSize) break
  }
  return cleared
}

export async function runDataRetention(
  db: RetentionClient,
  options: { dryRun: boolean; now: number; batchSize?: number; maxBatches?: number },
): Promise<RetentionReport> {
  const batchSize = options.batchSize ?? RETENTION_BATCH_SIZE
  const maxBatches = options.maxBatches ?? RETENTION_MAX_BATCHES
  const client = db.$client
  const rateCutoff = rateLimitCutoff(options.now)
  const windowCutoff = resultWindowCutoff(options.now)
  const clickCutoff = clickHashCutoff(options.now)
  const rateLimitsEligible = await countRows(
    client,
    'SELECT COUNT(*) AS n FROM rate_limits WHERE reset_at < ?',
    rateCutoff,
  )
  const resultWindowsEligible = await countRows(
    client,
    'SELECT COUNT(*) AS n FROM result_rate_windows WHERE expires_at < ?',
    windowCutoff,
  )
  const clickHashesEligible = await countRows(
    client,
    'SELECT COUNT(*) AS n FROM clicks WHERE ts < ? AND ip_hash IS NOT NULL',
    clickCutoff,
  )
  if (options.dryRun) {
    return {
      event: 'data_retention',
      enabled: true,
      dryRun: true,
      wrote: false,
      rateLimitsEligible,
      rateLimitsDeleted: 0,
      resultWindowsEligible,
      resultWindowsDeleted: 0,
      clickHashesEligible,
      clickHashesCleared: 0,
      truncated: false,
    }
  }
  const rateLimitsDeleted = await deleteExpiredRateLimits(client, rateCutoff, batchSize, maxBatches)
  const resultWindowsDeleted = await deleteExpiredResultWindows(client, windowCutoff, batchSize, maxBatches)
  const clickHashesCleared = await clearOldClickHashes(client, clickCutoff, batchSize, maxBatches)
  return {
    event: 'data_retention',
    enabled: true,
    dryRun: false,
    wrote: rateLimitsDeleted + resultWindowsDeleted + clickHashesCleared > 0,
    rateLimitsEligible,
    rateLimitsDeleted,
    resultWindowsEligible,
    resultWindowsDeleted,
    clickHashesEligible,
    clickHashesCleared,
    truncated:
      rateLimitsDeleted < rateLimitsEligible ||
      resultWindowsDeleted < resultWindowsEligible ||
      clickHashesCleared < clickHashesEligible,
  }
}

function retentionEnv(): RetentionEnv {
  return {
    purge: process.env.DATA_RETENTION_PURGE,
    vercelEnv: process.env.VERCEL_ENV,
    dryRun: process.env.DATA_RETENTION_DRY_RUN,
  }
}

export async function handleRetentionCron(
  request: Request,
  deps: { db: () => RetentionClient; env?: RetentionEnv; now?: number; cronSecret?: string } = { db: getDb },
): Promise<Response> {
  const decision = decideRetentionRequest({
    authorization: request.headers.get('authorization'),
    cronSecret: deps.cronSecret ?? process.env.CRON_SECRET,
    env: deps.env ?? retentionEnv(),
  })
  if (!decision.ok) {
    console.error('data retention unauthorized')
    return NextResponse.json(decision.body, { status: decision.status, headers: NO_STORE })
  }
  if (!decision.run) {
    console.log(retentionLogLine(decision.report))
    return NextResponse.json(decision.report, { status: 200, headers: NO_STORE })
  }
  try {
    const report = await runDataRetention(deps.db(), { dryRun: decision.dryRun, now: deps.now ?? Date.now() })
    console.log(retentionLogLine(report))
    return NextResponse.json(report, { status: 200, headers: NO_STORE })
  } catch (error) {
    console.error('data retention failed', error instanceof Error ? error.name : 'error')
    return NextResponse.json({ error: 'retention-failed' }, { status: 500, headers: NO_STORE })
  }
}

export function GET(request: Request): Promise<Response> {
  return handleRetentionCron(request)
}
