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

/**
 * Login bucket from Vercel's trusted client IP (`x-vercel-forwarded-for`).
 * `x-forwarded-for` is ignored because the client can set it.
 * The stored key is an HMAC, not the address. A missing or unusable header
 * shares one bucket so those requests are still limited.
 */
export function signupsLoginBucket(request: Request, secret = signupsSessionSecret()): string {
  const header = request.headers.get('x-vercel-forwarded-for')
  const first = header?.split(',')[0]?.trim() ?? ''
  const ip = first ? canonicalIp(first) : null
  const material = ip ?? 'missing'
  return createHmac('sha256', secret).update(`bestbotfor-signups-login|v1|${material}`).digest('hex')
}
