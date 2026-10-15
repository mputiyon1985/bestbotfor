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
): Promise<{ ok: boolean; remaining: number }> {
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
      RETURNING count
    `,
    args: [key, resetAt, now, now, resetAt],
  })
  const count = Number(result.rows[0]?.count ?? 0)
  if (!Number.isFinite(count) || count <= 0) return { ok: false, remaining: 0 }
  const ok = count <= limit
  return { ok, remaining: ok ? limit - count : 0 }
}
