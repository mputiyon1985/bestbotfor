import { describe, expect, it } from 'vitest'
import { AUDIT_PAYMENT_HOST, AUDIT_PAYMENT_URL } from './audit-offer'

describe('audit offer', () => {
  it('links to a Stripe hosted Payment Link over https with no credentials or port', () => {
    const url = new URL(AUDIT_PAYMENT_URL)
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe(AUDIT_PAYMENT_HOST)
    expect(url.username).toBe('')
    expect(url.port).toBe('')
    expect(url.search).toBe('')
  })
})
