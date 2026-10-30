import { createHmac } from 'node:crypto'
import { canonicalIp } from '@/lib/reviews/ip'
import { signupsSessionSecret } from './config'

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

export type SignupsLoginLimit = { action: 'limit'; bucket: string } | { action: 'skip' } | { action: 'refuse' }

/**
 * Vercel, even when VERCEL_REGION is missing. Region is not required: a deploy
 * that forgets it must still fail closed instead of turning the limit off.
 * Local dev has neither signal, which is the opt-out.
 */
export function signupsRunsOnVercel(
  env: { vercel?: string; vercelEnv?: string } = {
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
  },
): boolean {
  if (env.vercel === '1') return true
  const name = env.vercelEnv?.trim() ?? ''
  return name === 'production' || name === 'preview'
}

/**
 * Login bucket from Vercel's trusted client IP (`x-vercel-forwarded-for`).
 * The header is ignored off Vercel, because the client can set it there.
 * `x-forwarded-for` is ignored everywhere. The stored key is an HMAC, not the address.
 * On Vercel a missing or unusable address is refused. It does not share one bucket.
 */
export function signupsLoginBucket(request: Request, secret = signupsSessionSecret()): SignupsLoginLimit {
  if (!signupsRunsOnVercel()) return { action: 'skip' }
  const header = request.headers.get('x-vercel-forwarded-for')
  const first = header?.split(',')[0]?.trim() ?? ''
  const ip = first ? canonicalIp(first) : null
  if (!ip) return { action: 'refuse' }
  return {
    action: 'limit',
    bucket: createHmac('sha256', secret).update(`bestbotfor-signups-login|v1|${ip}`).digest('hex'),
  }
}
