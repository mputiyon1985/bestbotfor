import { describe, expect, it } from 'vitest'
import { decideRedirect, isStripeHostedUrl, officialHttpsUrl } from './redirect'

describe('decideRedirect', () => {
  it('sends people to the stored official https URL', () => {
    const decision = decideRedirect({
      tool: { url: 'https://chatgpt.com', affiliateUrl: 'https://evil.example/aff?ref=1' },
    })
    expect(decision).toEqual({ type: 'redirect', url: 'https://chatgpt.com/' })
  })

  it('refuses a missing tool and a non-https official URL', () => {
    expect(decideRedirect({ tool: null })).toEqual({ type: 'not_found' })
    expect(decideRedirect({ tool: { url: 'http://chatgpt.com', affiliateUrl: null } })).toEqual({ type: 'not_found' })
    expect(decideRedirect({ tool: { url: 'javascript:alert(1)', affiliateUrl: null } })).toEqual({ type: 'not_found' })
  })

  it('rejects credentials, localhost, and IP addresses', () => {
    expect(officialHttpsUrl('https://user:pass@chatgpt.com/')).toBeNull()
    expect(officialHttpsUrl('https://localhost/tool')).toBeNull()
    expect(officialHttpsUrl('https://127.0.0.1/tool')).toBeNull()
    expect(officialHttpsUrl('https://chatgpt.com/path?official=1')).toBe('https://chatgpt.com/path?official=1')
  })

  it('only treats Stripe Checkout and Billing hosts as billing redirects', () => {
    expect(isStripeHostedUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true)
    expect(isStripeHostedUrl('https://billing.stripe.com/p/session/test')).toBe(true)
    expect(isStripeHostedUrl('https://evil.example/checkout.stripe.com')).toBe(false)
    expect(isStripeHostedUrl('http://checkout.stripe.com/c/pay/cs_test_123')).toBe(false)
  })
})
