import type { Database } from './db/client'
import { withDeadline } from './deadline'
import { consumeRateLimit } from './rate-limit'

export const ACTION_LIMITS = {
  result: { limit: 30, windowMs: 60_000 },
  checkout: { limit: 8, windowMs: 60 * 60_000 },
  portal: { limit: 12, windowMs: 60 * 60_000 },
} as const

/** A slow or failed limiter must not turn the page into a hang. Over-limit still blocks. */
export async function allowRate(db: Database, key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const result = await withDeadline(consumeRateLimit(db, key, limit, windowMs), 800)
    return result.ok
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return true
  }
}
