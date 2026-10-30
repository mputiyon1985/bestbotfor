import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/signups/auth/password'

describe('password', () => {
  it('verifies a scrypt hash and rejects other passwords', () => {
    const stored = hashPassword('test-password-value')
    expect(stored.startsWith('scrypt:16384:8:1:')).toBe(true)
    expect(verifyPassword('test-password-value', stored)).toBe(true)
    expect(verifyPassword('wrong-password-value', stored)).toBe(false)
    expect(verifyPassword('test-password-value', 'scrypt:16384:8:1:bad:bad')).toBe(false)
    expect(verifyPassword('test-password-value', '')).toBe(false)
  })
})
