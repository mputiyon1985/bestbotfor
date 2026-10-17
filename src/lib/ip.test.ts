import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rateLimitKey } from './ip'

const SECRET_NAMES = [
  'RATE_LIMIT_HMAC_SECRET',
  'CLERK_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'TURSO_AUTH_TOKEN',
  'IP_HASH_SALT',
  'BEEHIIV_API_KEY',
] as const

const previous = new Map<string, string | undefined>(SECRET_NAMES.map((name) => [name, process.env[name]]))

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

describe('rateLimitKey', () => {
  it('uses HMAC-SHA256 keyed by RATE_LIMIT_HMAC_SECRET, not a plain hash', () => {
    clearSecrets()
    process.env.RATE_LIMIT_HMAC_SECRET = 'dedicated-secret'
    const payload = 'bestbotfor-rate|result|203.0.113.7'
    const key = rateLimitKey('203.0.113.7', 'result')
    expect(key).toBe(createHmac('sha256', 'dedicated-secret').update(payload).digest('hex'))
    expect(key).not.toBe(createHash('sha256').update(payload).digest('hex'))
    process.env.RATE_LIMIT_HMAC_SECRET = 'other-secret'
    expect(rateLimitKey('203.0.113.7', 'result')).not.toBe(key)
    expect(rateLimitKey(null, 'result')).toBe(
      createHmac('sha256', 'other-secret').update('bestbotfor-rate|result|unknown').digest('hex'),
    )
  })

  it('derives a fallback from an existing server secret and warns once, without throwing', () => {
    clearSecrets()
    process.env.CLERK_SECRET_KEY = 'clerk-server-secret'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const payload = 'bestbotfor-rate|checkout|user_1'
    const key = rateLimitKey('user_1', 'checkout')
    expect(key).toBe(createHmac('sha256', 'clerk-server-secret').update(payload).digest('hex'))
    expect(rateLimitKey('user_1', 'checkout')).toBe(key)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('RATE_LIMIT_HMAC_SECRET')
    expect(String(warn.mock.calls[0]?.[0])).toContain('CLERK_SECRET_KEY')
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('clerk-server-secret')
  })

  it('uses one process-local key when no server secret is set', () => {
    clearSecrets()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = rateLimitKey('198.51.100.4', 'portal')
    const second = rateLimitKey('198.51.100.4', 'portal')
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toBe(
      createHash('sha256').update('bestbotfor-rate|portal|198.51.100.4').digest('hex'),
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).not.toMatch(/[0-9a-f]{32,}/)
  })
})
