import { createHash, createHmac, hkdfSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET_NAMES = [
  'RATE_LIMIT_HMAC_SECRET',
  'CLERK_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'TURSO_AUTH_TOKEN',
  'IP_HASH_SALT',
  'BEEHIIV_API_KEY',
] as const

const HKDF_SALT = 'bestbotfor/rate-limit-hkdf-salt/v1'

const previous = new Map<string, string | undefined>(SECRET_NAMES.map((name) => [name, process.env[name]]))

let rateLimitKey: (ip: string | null, action: string) => string

beforeEach(async () => {
  vi.resetModules()
  ;({ rateLimitKey } = await import('./ip'))
  clearSecrets()
})

afterEach(() => {
  for (const name of SECRET_NAMES) {
    const value = previous.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  vi.restoreAllMocks()
})

function clearSecrets(): void {
  for (const name of SECRET_NAMES) delete process.env[name]
}

function derivedKey(secret: string, source: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, `bestbotfor/rate-limit-key/v1:${source}`, 32))
}

function hmac(key: string | Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('hex')
}

describe('rateLimitKey', () => {
  it('uses HMAC-SHA256 keyed directly by RATE_LIMIT_HMAC_SECRET, not a plain hash or HKDF', () => {
    process.env.RATE_LIMIT_HMAC_SECRET = 'dedicated-secret'
    const payload = 'bestbotfor-rate|result|203.0.113.7'
    const key = rateLimitKey('203.0.113.7', 'result')
    expect(key).toBe(hmac('dedicated-secret', payload))
    expect(key).not.toBe(createHash('sha256').update(payload).digest('hex'))
    expect(key).not.toBe(hmac(derivedKey('dedicated-secret', 'RATE_LIMIT_HMAC_SECRET'), payload))
    process.env.RATE_LIMIT_HMAC_SECRET = 'other-secret'
    const rotated = rateLimitKey('203.0.113.7', 'result')
    expect(rotated).toBe(hmac('other-secret', payload))
    expect(rotated).not.toBe(key)
    expect(rotated).not.toBe(hmac(derivedKey('other-secret', 'RATE_LIMIT_HMAC_SECRET'), payload))
    expect(rateLimitKey(null, 'result')).toBe(hmac('other-secret', 'bestbotfor-rate|result|unknown'))
  })

  it('HMACs under an HKDF-SHA256 key derived from a server secret and warns once', () => {
    process.env.CLERK_SECRET_KEY = 'clerk-server-secret'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const payload = 'bestbotfor-rate|checkout|user_1'
    const key = rateLimitKey('user_1', 'checkout')
    expect(derivedKey('clerk-server-secret', 'CLERK_SECRET_KEY')).toHaveLength(32)
    expect(key).toBe(hmac(derivedKey('clerk-server-secret', 'CLERK_SECRET_KEY'), payload))
    expect(key).not.toBe(hmac('clerk-server-secret', payload))
    expect(rateLimitKey('user_1', 'checkout')).toBe(key)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('RATE_LIMIT_HMAC_SECRET')
    expect(message).toContain('HKDF-SHA256')
    expect(message).toContain('CLERK_SECRET_KEY')
    expect(message).not.toContain('clerk-server-secret')
  })

  it('skips a short earlier secret and derives from the next secret of at least 16 characters', () => {
    process.env.CLERK_SECRET_KEY = 'a'.repeat(15)
    process.env.STRIPE_WEBHOOK_SECRET = 'b'.repeat(16)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const payload = 'bestbotfor-rate|portal|user_2'
    const key = rateLimitKey('user_2', 'portal')
    expect(key).toBe(hmac(derivedKey('b'.repeat(16), 'STRIPE_WEBHOOK_SECRET'), payload))
    expect(key).not.toBe(hmac(derivedKey('a'.repeat(15), 'CLERK_SECRET_KEY'), payload))
    expect(key).not.toBe(hmac('b'.repeat(16), payload))
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('STRIPE_WEBHOOK_SECRET')
    expect(message).not.toContain('b'.repeat(16))
  })

  it('uses one process-local key when every candidate is missing or shorter than 16 characters', () => {
    process.env.CLERK_SECRET_KEY = 'too-short'
    process.env.TURSO_AUTH_TOKEN = 'tiny'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const payload = 'bestbotfor-rate|portal|198.51.100.4'
    const first = rateLimitKey('198.51.100.4', 'portal')
    const second = rateLimitKey('198.51.100.4', 'portal')
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toBe(createHash('sha256').update(payload).digest('hex'))
    expect(first).not.toBe(hmac('too-short', payload))
    expect(first).not.toBe(hmac(derivedKey('too-short', 'CLERK_SECRET_KEY'), payload))
    clearSecrets()
    expect(rateLimitKey('198.51.100.4', 'portal')).toBe(first)
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('16')
    expect(message).not.toContain('too-short')
    expect(message).not.toContain('tiny')
    expect(message).not.toMatch(/[0-9a-f]{32,}/)
  })
})
