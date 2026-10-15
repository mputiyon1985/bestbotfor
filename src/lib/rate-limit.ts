import { eq } from 'drizzle-orm'
import type { Database } from './db'
import { rateLimits } from './db/schema'

/**
 * Fixed window counter. A burst across two app instances can exceed the limit
 * by a small amount; the unique key still caps each window. Fail closed when
 * the database write fails so signup and /go cannot skip the limit.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ ok: boolean; remaining: number }> {
  const existing = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1)
  const row = existing[0]
  if (!row || row.resetAt <= now) {
    await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: now + windowMs })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, resetAt: now + windowMs },
      })
    return { ok: true, remaining: limit - 1 }
  }
  if (row.count >= limit) return { ok: false, remaining: 0 }
  const next = row.count + 1
  await db.update(rateLimits).set({ count: next }).where(eq(rateLimits.key, key))
  return { ok: next <= limit, remaining: Math.max(0, limit - next) }
}
