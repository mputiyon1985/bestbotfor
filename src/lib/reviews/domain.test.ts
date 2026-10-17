import { describe, expect, it } from 'vitest'
import { registrableDomain } from './domain'

describe('registrableDomain', () => {
  it('returns the eTLD+1 for a host, a URL, and an email', () => {
    expect(registrableDomain('foo.openai.com')).toBe('openai.com')
    expect(registrableDomain('https://claude.anthropic.com/docs')).toBe('anthropic.com')
    expect(registrableDomain('user@openai.com')).toBe('openai.com')
    expect(registrableDomain('localhost')).toBeNull()
    expect(registrableDomain('not a domain')).toBeNull()
  })
})
