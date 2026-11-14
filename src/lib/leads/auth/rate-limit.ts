import 'server-only'
import type { Database } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { platformSetsClientIp } from '@/lib/reviews/ip'
import { consumeRateLimit } from '@/lib/rate-limit'

/** Attempts per IP before the password or import token is compared. */
export const LEADS_LOGIN_LIMIT = 8
export const LEADS_LOGIN_WINDOW_MS = 15 * 60 * 1000

export const LEADS_LOGIN_ACTION = 'leads-login'
export const LEADS_IMPORT_ACTION = 'leads-import'

/**
 * Bucket for an attempt. Login and import do not share a bucket.
 * On Vercel a missing trusted IP is refused and does not share one bucket.
 * Off Vercel the first forwarded address is used.
 * The stored key is an HMAC from rateLimitKey, not the address.
 */
export function leadsAttemptKey(request: Request, action = LEADS_LOGIN_ACTION): { action: 'ok'; key: string } | { action: 'refuse' } {
  const onVercel = platformSetsClientIp({ vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV })
  const ip = clientIp(request.headers)
  if (onVercel && !ip) return { action: 'refuse' }
  return { action: 'ok', key: rateLimitKey(ip, action) }
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

/** Give back one count after a successful import so only failed bearer attempts stay counted. */
export async function releaseLeadsAttempt(db: Database, key: string, now = Date.now()): Promise<void> {
  await db.$client.execute({
    sql: 'UPDATE rate_limits SET count = count - 1 WHERE "key" = ? AND count > 0 AND reset_at > ?',
    args: [key, now],
  })
}
