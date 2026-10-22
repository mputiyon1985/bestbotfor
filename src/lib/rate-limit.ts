import { createHash } from 'node:crypto'
import type { Client } from '@libsql/client'
import { configureFileDatabase, limiterClientFor } from './db/client'
import { isDeadline, withDeadline } from './deadline'
import type { Database } from './db'
import { RESULT_WINDOW_PURGE_INTERVAL_MS } from './rate-windows'

/**
 * One SQLite statement inserts or increments the window. Concurrent requests
 * cannot all read the old count and then write the same next value. Fail
 * closed when the write fails so signup and /go cannot skip the limit.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  const resetAt = now + windowMs
  const result = await db.$client.execute({
    sql: `
      INSERT INTO rate_limits ("key", count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT("key") DO UPDATE SET
        count = CASE
          WHEN rate_limits.reset_at <= ? THEN 1
          ELSE rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN rate_limits.reset_at <= ? THEN ?
          ELSE rate_limits.reset_at
        END
      RETURNING count, reset_at
    `,
    args: [key, resetAt, now, now, resetAt],
  })
  const count = Number(result.rows[0]?.count ?? 0)
  const storedReset = Number(result.rows[0]?.reset_at ?? resetAt)
  const windowEnd = Number.isFinite(storedReset) ? storedReset : resetAt
  if (!Number.isFinite(count) || count <= 0) return { ok: false, remaining: 0, resetAt: windowEnd }
  const ok = count <= limit
  return { ok, remaining: ok ? limit - count : 0, resetAt: windowEnd }
}

const localWindows = new Map<string, { count: number; resetAt: number }>()

/** Sweep expired keys once the map is large enough to matter. One key is replaced in place. */
const LOCAL_WINDOW_PRUNE_AT = 32

/** Test isolation. Production windows expire on their own. */
export function resetLocalRateLimits(): void {
  localWindows.clear()
}

export function localRateLimitSize(): number {
  return localWindows.size
}

function pruneExpiredLocalWindows(now: number): void {
  if (localWindows.size < LOCAL_WINDOW_PRUNE_AT) return
  for (const [key, window] of localWindows) {
    if (window.resetAt <= now) localWindows.delete(key)
  }
}

/**
 * Same window as the database limiter, kept in this process.
 * It does not wait on the network, so a burst can still be rejected when the
 * shared write is slow.
 */
export function consumeLocalRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; resetAt: number } {
  pruneExpiredLocalWindows(now)
  const current = localWindows.get(key)
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs
    localWindows.set(key, { count: 1, resetAt })
    return { ok: true, resetAt }
  }
  current.count += 1
  return { ok: current.count <= limit, resetAt: current.resetAt }
}

/**
 * Cap for the shared /result increment. Production Turso from this app's
 * region often answers around 470ms, and the first request on a cold
 * connection can take longer. 400ms missed that budget and every request
 * fell back to the per-instance window. 1000ms still returns before the
 * gate's 3s limit budget. Override with RESULT_SHARED_LIMIT_MS.
 */
export const RESULT_SHARED_LIMIT_MS = 1_000

const RESULT_SHARED_LIMIT_MIN_MS = 50
const RESULT_SHARED_LIMIT_MAX_MS = 2_500

/** Budget for one shared increment. An override wins. A bad env value uses the default. */
export function resultSharedLimitMs(override?: number): number {
  if (override !== undefined) return override
  const raw = process.env.RESULT_SHARED_LIMIT_MS
  if (raw === undefined || raw.trim() === '') return RESULT_SHARED_LIMIT_MS
  const fromEnv = Number(raw)
  if (!Number.isFinite(fromEnv) || fromEnv < RESULT_SHARED_LIMIT_MIN_MS || fromEnv > RESULT_SHARED_LIMIT_MAX_MS) {
    return RESULT_SHARED_LIMIT_MS
  }
  return fromEnv
}

function resultWindowBucket(key: string, windowStart: number): string {
  return createHash('sha256').update(`bestbotfor-result-window|${key}|${windowStart}`).digest('hex')
}

function windowEnd(now: number, windowMs: number): { start: number; end: number } {
  const start = Math.floor(now / windowMs) * windowMs
  return { start, end: start + windowMs }
}

function isSqliteBusy(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? `${error.name} ${error.message}` : ''
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(`${code} ${message}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let writeChain: Promise<unknown> = Promise.resolve()

/** One write at a time in this process. Two servers then contend, not eight statements. */
function enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const run = writeChain.then(work, work)
  writeChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function limiterClient(db: Database): Promise<Client> {
  const client = limiterClientFor(db.$client)
  await configureFileDatabase(client)
  return client
}

async function insertResultWindow(db: Database, bucket: string, expiresAt: number, limit: number): Promise<{ ok: boolean; resetAt: number }> {
  const client = await limiterClient(db)
  const result = await enqueueWrite(() => client.execute({
    sql: `
      INSERT INTO result_rate_windows (bucket, count, expires_at)
      VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET
        count = result_rate_windows.count + 1
      RETURNING count
    `,
    args: [bucket, expiresAt],
  }))
  const count = Number(result.rows[0]?.count ?? 0)
  if (!Number.isFinite(count) || count <= 0) return { ok: false, resetAt: expiresAt }
  return { ok: count <= limit, resetAt: expiresAt }
}

type SharedWindowResult =
  | { ok: boolean; resetAt: number }
  | { fallback: 'timeout' | 'error'; errorName?: string }

/**
 * Atomic fixed-window increment. Null means the store did not answer in time
 * or threw. Callers then use the in-memory window. A brief lock is retried
 * inside the same budget so SQLITE_BUSY is not treated as "store down".
 */
export async function consumeSharedResultWindow(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  budgetMs = resultSharedLimitMs(),
): Promise<{ ok: boolean; resetAt: number } | null> {
  const result = await readSharedResultWindow(db, key, limit, windowMs, now, budgetMs)
  if ('fallback' in result) return null
  return result
}

async function readSharedResultWindow(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
  budgetMs: number,
): Promise<SharedWindowResult> {
  const { start, end } = windowEnd(now, windowMs)
  const bucket = resultWindowBucket(key, start)
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    try {
      return await withDeadline(insertResultWindow(db, bucket, end, limit), remaining)
    } catch (error) {
      if (isDeadline(error)) return { fallback: 'timeout' }
      if (isSqliteBusy(error) && Date.now() < deadline) {
        await delay(Math.min(20, deadline - Date.now()))
        continue
      }
      return { fallback: 'error', errorName: error instanceof Error ? error.name : 'Error' }
    }
  }
  return { fallback: 'timeout' }
}

/**
 * Delete windows that have already closed. Not part of the allow/deny decision.
 * Failures are logged and swallowed so waitUntil cannot fail the response.
 */
export async function purgeExpiredResultWindows(db: Database, now = Date.now()): Promise<void> {
  try {
    const client = await limiterClient(db)
    await client.execute({
      sql: 'DELETE FROM result_rate_windows WHERE expires_at <= ?',
      args: [now],
    })
  } catch (error) {
    console.error('result rate purge failed', error instanceof Error ? error.name : 'error')
  }
}

let lastResultWindowPurge = 0

/** At most one cleanup per process per minute, so a burst does not queue a delete per request. */
export function scheduleResultWindowPurge(db: Database, now = Date.now()): Promise<void> {
  if (now - lastResultWindowPurge < RESULT_WINDOW_PURGE_INTERVAL_MS) return Promise.resolve()
  lastResultWindowPurge = now
  return purgeExpiredResultWindows(db, now)
}

let resultRateFallbacks = 0

/** How many shared /result decisions in this process used the memory window. */
export function resultRateFallbackCount(): number {
  return resultRateFallbacks
}

/** Test isolation. The process count is not reset in production. */
export function resetResultRateFallbackCount(): void {
  resultRateFallbacks = 0
}

/**
 * One JSON line for a log drain. No IP, bucket, or key: those are secrets or
 * personal data. `count` is the process-local total, so an alert can fire on
 * the event name.
 */
function recordResultRateFallback(input: {
  reason: 'timeout' | 'error'
  elapsedMs: number
  budgetMs: number
  errorName?: string
}): void {
  resultRateFallbacks += 1
  const line: Record<string, string | number> = {
    event: 'result_rate_limit_fallback',
    reason: input.reason,
    elapsedMs: input.elapsedMs,
    budgetMs: input.budgetMs,
    count: resultRateFallbacks,
  }
  if (input.errorName) line.errorName = input.errorName
  console.error(JSON.stringify(line))
}

/**
 * The shared fixed window decides when it answers inside the budget.
 * Over the in-process limit, return immediately and skip that write.
 * A slow or failed store logs and uses the in-memory window so a valid quiz still renders.
 */
export async function consumeResultRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  sharedBudgetMs = resultSharedLimitMs(),
): Promise<{ ok: boolean; resetAt: number }> {
  const local = consumeLocalRateLimit(key, limit, windowMs, now)
  if (!local.ok) return local
  const started = Date.now()
  const shared = await readSharedResultWindow(db, key, limit, windowMs, now, sharedBudgetMs)
  if ('fallback' in shared) {
    recordResultRateFallback({
      reason: shared.fallback,
      elapsedMs: Date.now() - started,
      budgetMs: sharedBudgetMs,
      errorName: shared.errorName,
    })
    return local
  }
  return shared
}

/** Seconds for a Retry-After header. At least one second, rounded up. */
export function retryAfterSeconds(resetAt: number, now = Date.now()): number {
  if (!Number.isFinite(resetAt)) return 1
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}
