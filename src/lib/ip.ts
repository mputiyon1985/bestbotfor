import 'server-only'
import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'

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

/**
 * Server-only secrets already present on the host. Used only when
 * RATE_LIMIT_HMAC_SECRET is unset. Never a NEXT_PUBLIC_ value.
 * A candidate shorter than 16 characters is skipped.
 */
const RATE_LIMIT_FALLBACK_SECRETS = [
  'CLERK_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'TURSO_AUTH_TOKEN',
  'IP_HASH_SALT',
  'BEEHIIV_API_KEY',
] as const

const RATE_LIMIT_FALLBACK_MIN_LENGTH = 16
const RATE_LIMIT_HKDF_SALT = 'bestbotfor/rate-limit-hkdf-salt/v1'

let rateLimitWarning: string | null = null
let ephemeralRateLimitSecret: string | null = null

function warnRateLimitSecret(message: string): void {
  if (rateLimitWarning === message) return
  rateLimitWarning = message
  console.warn(message)
}

function serverSecret(name: string): string {
  return process.env[name]?.trim() ?? ''
}

/** 32-byte HMAC key. The source secret is the HKDF input, not the HMAC key. */
function fallbackHmacKey(secret: string, source: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, RATE_LIMIT_HKDF_SALT, `bestbotfor/rate-limit-key/v1:${source}`, 32),
  )
}

/**
 * RATE_LIMIT_HMAC_SECRET is the HMAC key itself.
 * Any other server secret is stretched with HKDF-SHA256 first.
 * A missing or too-short candidate logs a warning and never throws.
 * The secret and the derived key are not logged.
 * A new key starts new windows; counters already in flight are left behind.
 */
function rateLimitHmacSecret(): string | Buffer {
  const dedicated = serverSecret('RATE_LIMIT_HMAC_SECRET')
  if (dedicated) return dedicated
  for (const name of RATE_LIMIT_FALLBACK_SECRETS) {
    const value = serverSecret(name)
    if (value.length < RATE_LIMIT_FALLBACK_MIN_LENGTH) continue
    warnRateLimitSecret(
      `RATE_LIMIT_HMAC_SECRET is unset; deriving a 32-byte rate-limit HMAC key with HKDF-SHA256 from ${name}`,
    )
    return fallbackHmacKey(value, name)
  }
  if (!ephemeralRateLimitSecret) ephemeralRateLimitSecret = randomBytes(32).toString('hex')
  warnRateLimitSecret(
    'RATE_LIMIT_HMAC_SECRET is unset and no server secret of at least 16 characters is available; using a process-local rate-limit key',
  )
  return ephemeralRateLimitSecret
}

/** Rate-limit bucket key. HMAC-SHA256, not a plain hash, so the address cannot be brute-forced offline. */
export function rateLimitKey(ip: string | null, action: string): string {
  return createHmac('sha256', rateLimitHmacSecret())
    .update(`bestbotfor-rate|${action}|${ip ?? 'unknown'}`)
    .digest('hex')
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
