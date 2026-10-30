import { describe, expect, it } from 'vitest'
import { createSessionToken, SESSION_TTL_MS, verifySessionToken } from '@/lib/signups/auth/session'

const SECRET = 'test-session-secret-value'

describe('session', () => {
  it('signs and verifies a token', async () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00.000Z')
    const { token, payload } = await createSessionToken(SECRET, issuedAt)
    const verified = await verifySessionToken(token, SECRET, issuedAt + 1_000)
    expect(verified).toEqual(payload)
    expect(verified?.exp).toBe(Math.floor((issuedAt + SESSION_TTL_MS) / 1000))
  })

  it('accepts a token until the 12 hour expiry and rejects it at expiry', async () => {
    const issuedAt = Date.parse('2026-01-01T00:00:00.000Z')
    const { token } = await createSessionToken(SECRET, issuedAt)
    expect(await verifySessionToken(token, SECRET, issuedAt + SESSION_TTL_MS - 1)).not.toBeNull()
    expect(await verifySessionToken(token, SECRET, issuedAt + SESSION_TTL_MS)).toBeNull()
  })

  it('rejects a tampered signature, a tampered payload, and the wrong secret', async () => {
    const { token } = await createSessionToken(SECRET, Date.parse('2026-01-01T00:00:00.000Z'))
    const [body, signature] = token.split('.')
    const flipped = signature!.endsWith('a') ? `${signature!.slice(0, -1)}b` : `${signature!.slice(0, -1)}a`
    expect(await verifySessionToken(`${body}.${flipped}`, SECRET)).toBeNull()
    expect(await verifySessionToken(`${body}x.${signature}`, SECRET)).toBeNull()
    expect(await verifySessionToken(token, 'another-session-secret')).toBeNull()
    expect(await verifySessionToken('not-a-token', SECRET)).toBeNull()
  })
})
