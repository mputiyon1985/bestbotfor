import { describe, expect, it } from 'vitest'
import { base32Encode, totpCode, totpRaw, verifyTotp } from '@/lib/signups/auth/totp'

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii')

describe('TOTP', () => {
  it('matches the RFC 6238 SHA1 vectors', () => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ]
    for (const [time, code] of vectors) expect(totpRaw(RFC_SECRET, time, 30, 8)).toBe(code)
  })

  it('accepts the current 30s step and one step either side', () => {
    const secret = base32Encode(RFC_SECRET)
    const now = Date.parse('2026-06-01T12:00:00.000Z')
    const current = totpCode(secret, now)
    const previous = totpCode(secret, now - 30_000)
    const next = totpCode(secret, now + 30_000)
    const outside = totpCode(secret, now + 60_000)

    expect(verifyTotp(current, secret, now)).toBe(true)
    expect(verifyTotp(previous, secret, now)).toBe(true)
    expect(verifyTotp(next, secret, now)).toBe(true)
    expect(verifyTotp(outside, secret, now)).toBe(false)
    expect(verifyTotp('000000', secret, now)).toBe(false)
    expect(verifyTotp('12345', secret, now)).toBe(false)
    expect(verifyTotp('abcdef', secret, now)).toBe(false)
    expect(verifyTotp(current, '!!!!!!!!', now)).toBe(false)
  })
})
