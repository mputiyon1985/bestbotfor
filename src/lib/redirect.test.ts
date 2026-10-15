import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { decideRedirect, isStripeHostedUrl, officialHttpsUrl, reviewedToolUrl } from './redirect'

const chatgpt = ['chatgpt.com']

describe('decideRedirect', () => {
  it('sends people to the stored official https URL when the host is reviewed', () => {
    const decision = decideRedirect({
      tool: { url: 'https://chatgpt.com', affiliateUrl: 'https://evil.example/aff?ref=1', allowedHosts: chatgpt },
    })
    expect(decision).toEqual({ type: 'redirect', url: 'https://chatgpt.com/' })
  })

  it('refuses a missing tool, a non-https URL, and any host that was not reviewed', () => {
    expect(decideRedirect({ tool: null })).toEqual({ type: 'not_found' })
    expect(decideRedirect({ tool: { url: 'http://chatgpt.com', affiliateUrl: null, allowedHosts: chatgpt } })).toEqual({
      type: 'not_found',
    })
    expect(
      decideRedirect({ tool: { url: 'javascript:alert(1)', affiliateUrl: null, allowedHosts: chatgpt } }),
    ).toEqual({ type: 'not_found' })
    expect(
      decideRedirect({ tool: { url: 'https://evil.example', affiliateUrl: null, allowedHosts: chatgpt } }),
    ).toEqual({ type: 'not_found' })
    expect(officialHttpsUrl('https://not-reviewed.example', [])).toBeNull()
  })

  it('rejects credentials, localhost, IP addresses, and non-default ports', () => {
    expect(officialHttpsUrl('https://user:pass@chatgpt.com/', chatgpt)).toBeNull()
    expect(officialHttpsUrl('https://localhost/tool', ['localhost'])).toBeNull()
    expect(officialHttpsUrl('https://127.0.0.1/tool', ['127.0.0.1'])).toBeNull()
    expect(officialHttpsUrl('https://chatgpt.com:8443/', chatgpt)).toBeNull()
    expect(officialHttpsUrl('https://chatgpt.com:443/path?official=1', chatgpt)).toBe(
      'https://chatgpt.com/path?official=1',
    )
    expect(officialHttpsUrl('https://chatgpt.com./path', chatgpt)).toBe('https://chatgpt.com/path')
  })

  it('matches an exact host or a listed wildcard subdomain after IDNA normalization', () => {
    expect(officialHttpsUrl('https://docs.github.com/copilot', ['github.com'])).toBeNull()
    expect(officialHttpsUrl('https://docs.github.com/copilot', ['*.github.com'])).toBe('https://docs.github.com/copilot')
    expect(officialHttpsUrl('https://github.com/', ['*.github.com'])).toBeNull()
    expect(officialHttpsUrl('https://github.com.evil.com/', ['github.com', '*.github.com'])).toBeNull()
    expect(officialHttpsUrl('https://evilgithub.com/', ['*.github.com'])).toBeNull()
    expect(officialHttpsUrl('https://notgithub.com/', ['github.com'])).toBeNull()

    const unicode = 'https://bücher.example/docs'
    const punycode = new URL(unicode).hostname
    expect(officialHttpsUrl(unicode, [punycode])).toBe('https://xn--bcher-kva.example/docs')
    expect(officialHttpsUrl(unicode, ['bücher.example'])).toBe('https://xn--bcher-kva.example/docs')
    expect(officialHttpsUrl('https://xn--bcher-kva.example.evil.com/', ['bücher.example', '*.bücher.example'])).toBeNull()
  })

  it('accepts every seeded tool and rejects a foreign host for that tool', () => {
    expect(toolSeeds.length).toBeGreaterThan(0)
    for (const tool of toolSeeds) {
      expect(reviewedToolUrl(tool), tool.slug).toContain('https://')
      expect(officialHttpsUrl('https://evil.example/phish', tool.allowedHosts), tool.slug).toBeNull()
    }
  })

  it('fails the seed check when the official host is not listed exactly', () => {
    expect(() =>
      reviewedToolUrl({ slug: 'chatgpt', url: 'https://evil.example', allowedHosts: ['chatgpt.com'] }),
    ).toThrow(/reviewed host list/)
    expect(() =>
      reviewedToolUrl({ slug: 'chatgpt', url: 'https://www.chatgpt.com', allowedHosts: ['*.chatgpt.com'] }),
    ).toThrow(/exact reviewed host/)
  })

  it('only treats Stripe Checkout and Billing hosts as billing redirects', () => {
    expect(isStripeHostedUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true)
    expect(isStripeHostedUrl('https://billing.stripe.com/p/session/test')).toBe(true)
    expect(isStripeHostedUrl('https://evil.example/checkout.stripe.com')).toBe(false)
    expect(isStripeHostedUrl('http://checkout.stripe.com/c/pay/cs_test_123')).toBe(false)
    expect(isStripeHostedUrl('https://checkout.stripe.com:8443/c/pay/cs_test_123')).toBe(false)
  })
})
