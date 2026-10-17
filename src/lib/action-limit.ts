import type { Database } from './db/client'
import { withDeadline } from './deadline'
import { consumeRateLimit } from './rate-limit'

export const ACTION_LIMITS = {
  result: { limit: 30, windowMs: 60_000 },
  checkout: { limit: 8, windowMs: 60 * 60_000 },
  portal: { limit: 12, windowMs: 60 * 60_000 },
} as const

export type RateLimitOnError = 'open' | 'closed'

/**
 * A slow limiter must not hang the caller. Over-limit still blocks.
 * `onError` is chosen at each call. Write and abuse-sensitive actions
 * (checkout, the billing portal, signup forms) pass `closed` so a limiter
 * error denies the write. Read-only /result and catalog pages stay `open`:
 * a valid quiz must never 503 because the limiter failed.
 */
export async function allowRate(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  options: { onError: RateLimitOnError; now?: number },
): Promise<boolean> {
  try {
    const result = await withDeadline(consumeRateLimit(db, key, limit, windowMs, options.now), 800)
    return result.ok
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return options.onError === 'closed' ? false : true
  }
}
