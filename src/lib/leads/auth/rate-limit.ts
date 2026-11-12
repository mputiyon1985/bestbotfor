import 'server-only'
import type { Database } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { platformSetsClientIp } from '@/lib/reviews/ip'
import { consumeRateLimit } from '@/lib/rate-limit'

/** Attempts per IP before the password or import token is compared. */
export const LEADS_LOGIN_LIMIT = 8
export const LEADS_LOGIN_WINDOW_MS = 15 * 60 * 1000

const LEADS_LOGIN_ACTION = 'leads-login'

/**
 * Bucket for an attempt. On Vercel a missing trusted IP is refused
 * and does not share one bucket. Off Vercel the first forwarded address is used.
 * The stored key is an HMAC from rateLimitKey, not the address.
 */
export function leadsAttemptKey(request: Request): { action: 'ok'; key: string } | { action: 'refuse' } {
  const onVercel = platformSetsClientIp({ vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV })
  const ip = clientIp(request.headers)
  if (onVercel && !ip) return { action: 'refuse' }
  return { action: 'ok', key: rateLimitKey(ip, LEADS_LOGIN_ACTION) }
}

/**
 * Increment the window first, in one statement, and only then may the caller
 * compare a password or import token. A database error fails closed.
 */
export async function consumeLeadsAttempt(db: Database, key: string, now = Date.now()): Promise<'ok' | 'limited' | 'unavailable'> {
  try {
    const result = await consumeRateLimit(db, key, LEADS_LOGIN_LIMIT, LEADS_LOGIN_WINDOW_MS, now)
    return result.ok ? 'ok' : 'limited'
  } catch {
    return 'unavailable'
  }
}
