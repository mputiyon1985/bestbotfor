import { createHmac } from 'node:crypto'
import { canonicalIp, isVercelDeployment } from '@/lib/reviews/ip'
import { signupsSessionSecret } from './config'

export type SignupsLoginLimit = { action: 'limit'; bucket: string } | { action: 'skip' } | { action: 'refuse' }

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

/**
 * Login bucket from Vercel's trusted client IP (`x-vercel-forwarded-for`).
 * `x-forwarded-for` is ignored because the client can set it.
 * The stored key is an HMAC, not the address.
 * A missing or unusable header does not share one bucket: on Vercel the
 * attempt is refused, and off Vercel the limit is skipped so local login works.
 */
export function signupsLoginBucket(request: Request, secret = signupsSessionSecret()): SignupsLoginLimit {
  const header = request.headers.get('x-vercel-forwarded-for')
  const first = header?.split(',')[0]?.trim() ?? ''
  const ip = first ? canonicalIp(first) : null
  if (!ip) {
    const onVercel = isVercelDeployment({
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
    })
    return onVercel ? { action: 'refuse' } : { action: 'skip' }
  }
  return {
    action: 'limit',
    bucket: createHmac('sha256', secret).update(`bestbotfor-signups-login|v1|${ip}`).digest('hex'),
  }
}
