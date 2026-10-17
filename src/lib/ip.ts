import 'server-only'
import { createHmac, hkdfSync, randomBytes } from 'node:crypto'

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
 * Click logs store this HMAC and nothing else about the address.
 * A missing address stores no hash. The key is an HKDF subkey of the
 * rate-limit secret, not that secret and not a prefixed message.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHmac('sha256', clickIpHmacKey()).update(ip).digest('hex')
}

/**
 * Server-only secrets already present on the host. Used only when
 * RATE_LIMIT_HMAC_SECRET is unset or shorter than 16 characters.
 * Never a NEXT_PUBLIC_ value.
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
const RATE_LIMIT_HKDF_INFO = 'bestbotfor/rate-limit/v1'
const CLICK_IP_HKDF_INFO = 'bestbotfor/click-ip/v1'

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

type HmacMaterial = { secret: string; fallbackName: string | null }

/**
 * RATE_LIMIT_HMAC_SECRET is the HKDF input when it is at least 16 characters.
 * The HMAC key is the bestbotfor/rate-limit/v1 subkey, not the raw secret.
 * A shorter value is ignored. Any other server secret is stretched with HKDF-SHA256 first.
 * A missing or too-short candidate logs a warning and never throws.
 * The secret and the derived key are not logged.
 * A new subkey starts new windows. Counters already in flight are left behind once.
 */
function hmacMaterial(): HmacMaterial {
  const dedicated = serverSecret('RATE_LIMIT_HMAC_SECRET')
  const short = dedicated.length > 0 && dedicated.length < RATE_LIMIT_FALLBACK_MIN_LENGTH
  if (dedicated.length >= RATE_LIMIT_FALLBACK_MIN_LENGTH) return { secret: dedicated, fallbackName: null }
  for (const name of RATE_LIMIT_FALLBACK_SECRETS) {
    const value = serverSecret(name)
    if (value.length < RATE_LIMIT_FALLBACK_MIN_LENGTH) continue
    warnRateLimitSecret(
      short
        ? `RATE_LIMIT_HMAC_SECRET is shorter than 16 characters; deriving a 32-byte rate-limit HMAC key with HKDF-SHA256 from ${name}`
        : `RATE_LIMIT_HMAC_SECRET is unset; deriving a 32-byte rate-limit HMAC key with HKDF-SHA256 from ${name}`,
    )
    return { secret: value, fallbackName: name }
  }
  if (!ephemeralRateLimitSecret) ephemeralRateLimitSecret = randomBytes(32).toString('hex')
  warnRateLimitSecret(
    short
      ? 'RATE_LIMIT_HMAC_SECRET is shorter than 16 characters and no server secret of at least 16 characters is available; using a process-local rate-limit key'
      : 'RATE_LIMIT_HMAC_SECRET is unset and no server secret of at least 16 characters is available; using a process-local rate-limit key',
  )
  return { secret: ephemeralRateLimitSecret, fallbackName: null }
}

/** Same salt as the click subkey, different label, so the two keys differ. */
function rateLimitSubkey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, RATE_LIMIT_HKDF_SALT, RATE_LIMIT_HKDF_INFO, 32))
}

function rateLimitHmacSecret(): string | Buffer {
  const material = hmacMaterial()
  if (material.fallbackName) return fallbackHmacKey(material.secret, material.fallbackName)
  const dedicated = serverSecret('RATE_LIMIT_HMAC_SECRET')
  if (dedicated.length >= RATE_LIMIT_FALLBACK_MIN_LENGTH) return rateLimitSubkey(dedicated)
  return material.secret
}

/** HKDF subkey so a click hash cannot be reused as a rate-limit bucket id. */
function clickIpHmacKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', hmacMaterial().secret, RATE_LIMIT_HKDF_SALT, CLICK_IP_HKDF_INFO, 32))
}

function hmacHex(payload: string): string {
  return createHmac('sha256', rateLimitHmacSecret()).update(payload).digest('hex')
}

/** Rate-limit bucket key. HMAC-SHA256, not a plain hash, so the address cannot be brute-forced offline. */
export function rateLimitKey(ip: string | null, action: string): string {
  return hmacHex(`bestbotfor-rate|${action}|${ip ?? 'unknown'}`)
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
