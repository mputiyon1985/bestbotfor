import { createHash } from 'node:crypto'

function isIp(value: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true
  return value.includes(':') && /^[0-9a-f:.]+$/i.test(value)
}

/** First forwarded address. The raw value is never written to the database. */
export function clientIp(headerStore: Headers): string | null {
  const forwarded = headerStore.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim() ?? ''
    if (isIp(first)) return first
  }
  const real = headerStore.get('x-real-ip')?.trim() ?? ''
  if (real && isIp(real)) return real
  return null
}

/**
 * Click logs store this hash only when IP_HASH_SALT is set.
 * Without a salt we store no IP at all.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  const salt = process.env.IP_HASH_SALT?.trim()
  if (!salt) return null
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex')
}

/** Rate-limit bucket key. This is not the click-log hash and is not reversible to a person by itself. */
export function rateLimitKey(ip: string | null, action: string): string {
  return createHash('sha256').update(`bestbotfor-rate|${action}|${ip ?? 'unknown'}`).digest('hex')
}

export function countryCode(headerStore: Headers): string | null {
  const country = headerStore.get('x-vercel-ip-country')?.trim().toUpperCase() ?? ''
  return /^[A-Z]{2}$/.test(country) ? country : null
}

export function sameOriginPath(referrer: string | null, siteOrigin: string): string {
  if (!referrer) return 'direct'
  try {
    const url = new URL(referrer)
    if (url.origin !== siteOrigin) return 'direct'
    return url.pathname.slice(0, 200) || '/'
  } catch {
    return 'direct'
  }
}
