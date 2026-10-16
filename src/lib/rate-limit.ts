import type { Database } from './db'

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
 * Shared row write for after the response. A slow or failed write must not
 * decide the status: the in-memory counter already did.
 */
export function persistResultRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<void> {
  return consumeRateLimit(db, key, limit, windowMs, now).then(
    () => undefined,
    (error: unknown) => {
      console.error('result rate store failed', error instanceof Error ? error.name : 'error')
    },
  )
}

/**
 * Count in memory first, then write the shared row.
 * Callers fail open when this promise throws or passes its deadline: a stuck
 * write must not hide a quiz the catalog already found. Requests over the
 * in-process limit return before that write, so the burst is still rejected.
 */
export async function consumeResultRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ ok: boolean; resetAt: number }> {
  const local = consumeLocalRateLimit(key, limit, windowMs, now)
  if (!local.ok) return local
  const shared = await consumeRateLimit(db, key, limit, windowMs, now)
  return { ok: shared.ok, resetAt: shared.resetAt }
}

/** Seconds for a Retry-After header. At least one second, rounded up. */
export function retryAfterSeconds(resetAt: number, now = Date.now()): number {
  if (!Number.isFinite(resetAt)) return 1
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}
