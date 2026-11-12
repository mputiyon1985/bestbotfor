import 'server-only'
import type { Database } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { platformSetsClientIp } from '@/lib/reviews/ip'
import { consumeRateLimit } from '@/lib/rate-limit'

/** Failed password attempts per IP. A success does not increment the counter. */
export const LEADS_LOGIN_LIMIT = 8
export const LEADS_LOGIN_WINDOW_MS = 15 * 60 * 1000

const LEADS_LOGIN_ACTION = 'leads-login'

/**
 * Bucket for a failed attempt. On Vercel a missing trusted IP is refused
 * and does not share one bucket. Off Vercel the first forwarded address is used.
 * The stored key is an HMAC from rateLimitKey, not the address.
 */
export function leadsAttemptKey(request: Request): { action: 'ok'; key: string } | { action: 'refuse' } {
  const onVercel = platformSetsClientIp({ vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV })
  const ip = clientIp(request.headers)
  if (onVercel && !ip) return { action: 'refuse' }
  return { action: 'ok', key: rateLimitKey(ip, LEADS_LOGIN_ACTION) }
}

export async function checkLeadsAttempt(db: Database, key: string, now = Date.now()): Promise<'ok' | 'limited' | 'unavailable'> {
  try {
    const result = await db.$client.execute({
      sql: 'SELECT count, reset_at FROM rate_limits WHERE "key" = ?',
      args: [key],
    })
    const count = Number(result.rows[0]?.count ?? 0)
    const resetAt = Number(result.rows[0]?.reset_at ?? 0)
    if (!Number.isFinite(count) || !Number.isFinite(resetAt)) return 'unavailable'
    if (count >= LEADS_LOGIN_LIMIT && resetAt > now) return 'limited'
    return 'ok'
  } catch {
    return 'unavailable'
  }
}

/** Persist one failed attempt. Throws when the write fails so the caller can fail closed. */
export async function recordLeadsFailure(db: Database, key: string, now = Date.now()): Promise<void> {
  await consumeRateLimit(db, key, LEADS_LOGIN_LIMIT, LEADS_LOGIN_WINDOW_MS, now)
}
