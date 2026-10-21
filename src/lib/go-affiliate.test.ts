import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink, withUtmParams } from './go-redirect'

vi.mock('@/lib/analytics', () => ({ track: () => {} }))

const cursor = toolSeeds.find((tool) => tool.slug === 'cursor')!

function go(affiliateUrl: string | null) {
  return resolveGoRedirect({
    headers: new Headers(),
    ip: null,
    siteUrl: 'https://bestbotfor.com',
    seedUrl: cursor.url,
    allowedHosts: cursor.allowedHosts,
    limit: async () => ({ ok: true }),
    loadTool: async () => ({ id: 1, url: cursor.url, affiliateUrl }),
  })
}

describe('/go affiliate routing', () => {
  const host = new URL(cursor.url).hostname
  const affiliate = `https://${host}/?ref=bestbotfor`

  it('redirects to a reviewed-host affiliate URL and labels it as affiliate', async () => {
    const outcome = await go(affiliate)
    expect(outcome).toMatchObject({ status: 302, location: `${affiliate}&utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct` })
    expect(servesAffiliateLink('cursor', affiliate)).toBe(true)
  })

  it('falls back to the official URL when unset or off the allowlist, and is not labelled affiliate', async () => {
    for (const value of [null, 'https://evil.example/aff']) {
      const outcome = await go(value)
      expect(outcome).toMatchObject({ status: 302, location: `${new URL(cursor.url).toString()}?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct` })
      expect(servesAffiliateLink('cursor', value)).toBe(false)
    }
    expect(servesAffiliateLink('not-a-tool', affiliate)).toBe(false)
  })

  it('HEAD keeps the official URL', () => {
    expect(resolveHeadGoRedirect('cursor')).toMatchObject({ status: 302, location: new URL(cursor.url).toString() })
  })

  it('puts rel="sponsored" only on affiliate links', async () => {
    const { OutboundLink } = await import('@/components/outbound-link')
    const on = renderToStaticMarkup(createElement(OutboundLink, { slug: 'cursor', affiliate: true, children: 'Visit' }))
    const off = renderToStaticMarkup(createElement(OutboundLink, { slug: 'cursor', children: 'Visit' }))
    expect(on).toContain('rel="sponsored nofollow noopener"')
    expect(off).toContain('rel="nofollow noopener"')
    expect(off).not.toContain('sponsored')
  })

  it('passes through utm_* params only, without overriding the destination', () => {
    const out = new URL(
      withUtmParams('https://cursor.com/?ref=bbf&utm_source=partner', '?utm_source=x&utm_campaign=spring&next=https://evil.example&ref=hijack&utm_bad-key=1'),
    )
    expect(out.hostname).toBe('cursor.com')
    expect(out.searchParams.get('ref')).toBe('bbf')
    expect(out.searchParams.get('utm_source')).toBe('partner')
    expect(out.searchParams.get('utm_campaign')).toBe('spring')
    expect(out.searchParams.has('next')).toBe(false)
    expect(out.searchParams.has('utm_bad-key')).toBe(false)
    expect(withUtmParams('https://cursor.com/', `?utm_term=${'a'.repeat(101)}`)).toBe('https://cursor.com/')
  })
})

describe('ElevenLabs affiliate host', () => {
  it('allows try.elevenlabs.io for the affiliate URL only on ElevenLabs', () => {
    expect(servesAffiliateLink('elevenlabs', 'https://try.elevenlabs.io/bestbotfor')).toBe(true)
    expect(servesAffiliateLink('cursor', 'https://try.elevenlabs.io/bestbotfor')).toBe(false)
    expect(servesAffiliateLink('elevenlabs', 'https://evil.try.elevenlabs.io/x')).toBe(false)
  })
})
