import { NextResponse } from 'next/server'
import type { Client } from '@libsql/client'
import { getDb, type Database } from '@/lib/db/client'
import {
  RETENTION_BATCH_SIZE,
  RETENTION_MAX_BATCHES,
  clickHashCutoff,
  suggestionEmailCutoff,
  suggestionRowCutoff,
  decideRetentionRequest,
  rateLimitCutoff,
  resultWindowCutoff,
  retentionLogLine,
  retentionTargetOk,
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

const RETENTION_TABLES = {
  rate_limits: ['key', 'count', 'reset_at'],
  result_rate_windows: ['bucket', 'count', 'expires_at'],
  clicks: ['id', 'tool_id', 'page', 'ts', 'country', 'ip_hash'],
} as const

/** Missing table or column means the later DELETE and UPDATE must not run. */
async function retentionSchemaReady(client: Client): Promise<boolean> {
  for (const [table, columns] of Object.entries(RETENTION_TABLES)) {
    const result = await client.execute(`PRAGMA table_info(${table})`)
    const present = new Set(result.rows.map((row) => String(row.name)))
    if (!columns.every((column) => present.has(column))) return false
  }
  return true
}

/**
 * The suggestions table ships with #86. If it is missing, only the suggestion
 * purge is skipped; the other deletions still run.
 */
async function suggestionsSchemaReady(client: Client): Promise<boolean> {
  const result = await client.execute('PRAGMA table_info(suggestions)')
  const present = new Set(result.rows.map((row) => String(row.name)))
  return ['id', 'email', 'created_at'].every((column) => present.has(column))
}

function countsOnly(dryRun: boolean, counts?: Partial<RetentionReport>): RetentionReport {
  return {
    event: 'data_retention',
    enabled: true,
    dryRun,
    wrote: false,
    rateLimitsEligible: counts?.rateLimitsEligible ?? 0,
    rateLimitsDeleted: 0,
    resultWindowsEligible: counts?.resultWindowsEligible ?? 0,
    resultWindowsDeleted: 0,
    clickHashesEligible: counts?.clickHashesEligible ?? 0,
    clickHashesCleared: 0,
    suggestionEmailsEligible: counts?.suggestionEmailsEligible ?? 0,
    suggestionEmailsCleared: 0,
    suggestionsEligible: counts?.suggestionsEligible ?? 0,
    suggestionsDeleted: 0,
    truncated: false,
  }
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

/** Deletes suggestion rows older than 24 months. The message and email are never selected. */
async function deleteOldSuggestions(client: Client, cutoff: number, batchSize: number, maxBatches: number): Promise<number> {
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await client.execute({
      sql: `DELETE FROM suggestions WHERE id IN (
        SELECT id FROM suggestions WHERE created_at < ? LIMIT ?
      )`,
      args: [cutoff, batchSize],
    })
    const affected = countOf(result.rowsAffected)
    deleted += affected
    if (affected < batchSize) break
  }
  return deleted
}

/** Clears the optional email on suggestions older than 90 days and keeps the row. */
async function clearOldSuggestionEmails(client: Client, cutoff: number, batchSize: number, maxBatches: number): Promise<number> {
  let cleared = 0
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await client.execute({
      sql: `UPDATE suggestions SET email = NULL WHERE id IN (
        SELECT id FROM suggestions WHERE created_at < ? AND email IS NOT NULL LIMIT ?
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
  options: { dryRun: boolean; now: number; batchSize?: number; maxBatches?: number; url?: string; vercelEnv?: string },
): Promise<RetentionReport> {
  const batchSize = options.batchSize ?? RETENTION_BATCH_SIZE
  const maxBatches = options.maxBatches ?? RETENTION_MAX_BATCHES
  const client = db.$client
  if (!(await retentionSchemaReady(client))) {
    console.error('data retention guard refused', 'schema')
    return countsOnly(options.dryRun)
  }
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
  const suggestionsReady = await suggestionsSchemaReady(client)
  const rowCutoff = suggestionRowCutoff(options.now)
  const emailCutoff = suggestionEmailCutoff(options.now)
  const suggestionsEligible = suggestionsReady
    ? await countRows(client, 'SELECT COUNT(*) AS n FROM suggestions WHERE created_at < ?', rowCutoff)
    : 0
  // Rows about to be deleted are not counted again as emails to clear.
  const suggestionEmailsEligible = suggestionsReady
    ? countOf(
        (
          await client.execute({
            sql: 'SELECT COUNT(*) AS n FROM suggestions WHERE created_at < ? AND created_at >= ? AND email IS NOT NULL',
            args: [emailCutoff, rowCutoff],
          })
        ).rows[0]?.n,
      )
    : 0
  const counted = { rateLimitsEligible, resultWindowsEligible, clickHashesEligible, suggestionEmailsEligible, suggestionsEligible }
  if (options.dryRun) return countsOnly(true, counted)
  if (!retentionTargetOk({ url: options.url, protocol: client.protocol, vercelEnv: options.vercelEnv })) {
    console.error('data retention guard refused', 'target')
    return countsOnly(false, counted)
  }
  const rateLimitsDeleted = await deleteExpiredRateLimits(client, rateCutoff, batchSize, maxBatches)
  const resultWindowsDeleted = await deleteExpiredResultWindows(client, windowCutoff, batchSize, maxBatches)
  const clickHashesCleared = await clearOldClickHashes(client, clickCutoff, batchSize, maxBatches)
  const suggestionsDeleted = suggestionsReady ? await deleteOldSuggestions(client, rowCutoff, batchSize, maxBatches) : 0
  const suggestionEmailsCleared = suggestionsReady
    ? await clearOldSuggestionEmails(client, emailCutoff, batchSize, maxBatches)
    : 0
  return {
    event: 'data_retention',
    enabled: true,
    dryRun: false,
    wrote: rateLimitsDeleted + resultWindowsDeleted + clickHashesCleared + suggestionsDeleted + suggestionEmailsCleared > 0,
    rateLimitsEligible,
    rateLimitsDeleted,
    resultWindowsEligible,
    resultWindowsDeleted,
    clickHashesEligible,
    clickHashesCleared,
    suggestionEmailsEligible,
    suggestionEmailsCleared,
    suggestionsEligible,
    suggestionsDeleted,
    truncated:
      rateLimitsDeleted < rateLimitsEligible ||
      resultWindowsDeleted < resultWindowsEligible ||
      clickHashesCleared < clickHashesEligible ||
      suggestionsDeleted < suggestionsEligible ||
      suggestionEmailsCleared < suggestionEmailsEligible,
  }
}

function retentionEnv(): RetentionEnv {
  return {
    purge: process.env.DATA_RETENTION_PURGE,
    vercelEnv: process.env.VERCEL_ENV,
    dryRun: process.env.DATA_RETENTION_DRY_RUN,
  }
}

function methodNotAllowed(): Response {
  return new NextResponse(null, { status: 405, headers: { ...NO_STORE, allow: 'GET' } })
}

export async function handleRetentionCron(
  request: Request,
  deps: { db: () => RetentionClient; env?: RetentionEnv; now?: number; cronSecret?: string; url?: string } = {
    db: getDb,
  },
): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed()
  const env = deps.env ?? retentionEnv()
  const decision = decideRetentionRequest({
    authorization: request.headers.get('authorization'),
    cronSecret: deps.cronSecret ?? process.env.CRON_SECRET,
    env,
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
    const report = await runDataRetention(deps.db(), {
      dryRun: decision.dryRun,
      now: deps.now ?? Date.now(),
      url: deps.url ?? process.env.TURSO_DATABASE_URL,
      vercelEnv: env.vercelEnv,
    })
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

/** Next would call GET for a missing HEAD export. This must not run the job. */
export function HEAD(): Response {
  return methodNotAllowed()
}
