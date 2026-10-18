import type { Database } from './db/client'
import { withDeadline } from './deadline'
import { consumeRateLimit } from './rate-limit'
import {
  CHECKOUT_RATE_LIMIT,
  CHECKOUT_RATE_WINDOW_MS,
  GO_RATE_LIMIT,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_LIMIT,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_LIMIT,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_LIMIT,
  RESULT_RATE_WINDOW_MS,
  SPONSOR_RATE_LIMIT,
  SPONSOR_RATE_WINDOW_MS,
} from './rate-windows'

export const ACTION_LIMITS = {
  result: { limit: RESULT_RATE_LIMIT, windowMs: RESULT_RATE_WINDOW_MS },
  checkout: { limit: CHECKOUT_RATE_LIMIT, windowMs: CHECKOUT_RATE_WINDOW_MS },
  portal: { limit: PORTAL_RATE_LIMIT, windowMs: PORTAL_RATE_WINDOW_MS },
  newsletter: { limit: NEWSLETTER_RATE_LIMIT, windowMs: NEWSLETTER_RATE_WINDOW_MS },
  go: { limit: GO_RATE_LIMIT, windowMs: GO_RATE_WINDOW_MS },
  sponsor: { limit: SPONSOR_RATE_LIMIT, windowMs: SPONSOR_RATE_WINDOW_MS },
} as const

export type RateLimitOnError = 'open' | 'closed'

/** `unavailable` is a limiter throw or timeout. `limit` is a full window. */
export type RateLimitDecision = 'allow' | 'limit' | 'unavailable'

/**
 * A slow limiter must not hang the caller. Over-limit still blocks.
 * `onError` is chosen at each call. Write and abuse-sensitive actions
 * (checkout, the billing portal, sponsor checkout, signup forms) pass `closed`,
 * which returns `unavailable` so the caller can deny the write. Read-only
 * /result and catalog pages stay `open`: a valid quiz must never 503 because
 * the limiter failed.
 */
export async function allowRate(
  db: Database,
  key: string,
  limit: number,
  windowMs: number,
  options: { onError: RateLimitOnError; now?: number },
): Promise<RateLimitDecision> {
  try {
    const result = await withDeadline(consumeRateLimit(db, key, limit, windowMs, options.now), 800)
    return result.ok ? 'allow' : 'limit'
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return options.onError === 'closed' ? 'unavailable' : 'allow'
  }
}
