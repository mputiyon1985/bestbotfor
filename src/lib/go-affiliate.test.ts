import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { officialHttpsUrl } from './redirect'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink, withUtmParams } from './go-redirect'

vi.mock('@/lib/analytics', () => ({ track: () => {} }))

const cursor = toolSeeds.find((tool) => tool.slug === 'cursor')!

function go(affiliateUrl: string | null, affiliateStatus = 'inactive', network: string | null = null) {
  return resolveGoRedirect({
    headers: new Headers(),
    ip: null,
    siteUrl: 'https://bestbotfor.com',
    seedUrl: cursor.url,
    allowedHosts: cursor.allowedHosts,
    limit: async () => ({ ok: true }),
    loadTool: async () => ({ id: 1, url: cursor.url, affiliateUrl, affiliateStatus, network }),
  })
}

describe('/go affiliate routing', () => {
  const host = new URL(cursor.url).hostname
  const affiliate = `https://${host}/?ref=bestbotfor`

  it('redirects to a reviewed-host affiliate URL only when status is active', async () => {
    const outcome = await go(affiliate, 'active', 'PartnerStack')
    expect(outcome).toMatchObject({
      status: 302,
      location: `${affiliate}&utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct`,
      click: { affiliate: true, programId: 1, subIdParam: 'sid' },
    })
    expect(servesAffiliateLink('cursor', affiliate, 'active')).toBe(true)
  })

  it('falls back to the official URL when inactive, unset, or off the allowlist', async () => {
    const inactive = await go(affiliate, 'inactive')
    expect(inactive).toMatchObject({
      status: 302,
      location: `${new URL(cursor.url).toString()}?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct`,
      click: { affiliate: false, programId: null, subIdParam: null },
    })
    expect(servesAffiliateLink('cursor', affiliate, 'inactive')).toBe(false)
    expect(servesAffiliateLink('cursor', affiliate, 'available')).toBe(false)
    for (const value of [null, 'https://evil.example/aff']) {
      const outcome = await go(value, 'active')
      expect(outcome).toMatchObject({ status: 302, location: `${new URL(cursor.url).toString()}?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct` })
      expect(servesAffiliateLink('cursor', value, 'active')).toBe(false)
    }
    expect(servesAffiliateLink('not-a-tool', affiliate, 'active')).toBe(false)
  })

  it('HEAD keeps the official URL', () => {
    expect(resolveHeadGoRedirect('cursor')).toMatchObject({ status: 302, location: new URL(cursor.url).toString() })
  })

  it('puts rel="sponsored" only on affiliate links', async () => {
    const { OutboundLink } = await import('@/components/outbound-link')
    const on = renderToStaticMarkup(createElement(OutboundLink, { slug: 'cursor', affiliate: true, children: 'Visit' }))
    const off = renderToStaticMarkup(createElement(OutboundLink, { slug: 'cursor', children: 'Visit' }))
    expect(on).toContain('rel="sponsored nofollow noopener"')
    expect(on).not.toContain('noreferrer')
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

describe('network tracking hosts', () => {
  function hosts(slug: string) {
    const tool = toolSeeds.find((item) => item.slug === slug)
    if (!tool) throw new Error(slug)
    return tool.allowedHosts
  }

  it('allows each prepared program only its own tracking hosts, and only labels an active link', () => {
    expect(officialHttpsUrl('https://try.elevenlabs.io/bestbotfor', hosts('elevenlabs'))).toBe('https://try.elevenlabs.io/bestbotfor')
    expect(officialHttpsUrl('https://partnerstack.com/click', hosts('elevenlabs'))).toBe('https://partnerstack.com/click')
    expect(officialHttpsUrl('https://acme.partnerstack.com/click', hosts('elevenlabs'))).toBe('https://acme.partnerstack.com/click')
    expect(officialHttpsUrl('https://partnerstack.com.evil.com/click', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://evil.try.elevenlabs.io/x', hosts('elevenlabs'))).toBeNull()
    expect(servesAffiliateLink('elevenlabs', 'https://try.elevenlabs.io/bestbotfor', 'inactive')).toBe(false)
    expect(servesAffiliateLink('elevenlabs', 'https://try.elevenlabs.io/bestbotfor', 'active')).toBe(true)
    expect(servesAffiliateLink('cursor', 'https://try.elevenlabs.io/bestbotfor', 'active')).toBe(false)

    expect(officialHttpsUrl('https://track.sjv.io/c/1', hosts('lovable'))).toBe('https://track.sjv.io/c/1')
    expect(officialHttpsUrl('https://sjv.io/c/1', hosts('lovable'))).toBeNull()
    expect(officialHttpsUrl('https://track.sjv.io.evil.com/c', hosts('lovable'))).toBeNull()
    expect(officialHttpsUrl('https://track.sjv.io/c/1', hosts('elevenlabs'))).toBeNull()

    expect(officialHttpsUrl('https://dub.sh/v0', hosts('v0'))).toBe('https://dub.sh/v0')
    expect(officialHttpsUrl('https://dub.sh/v0', hosts('lovable'))).toBeNull()

    expect(officialHttpsUrl('https://refer.papermark.com/example', hosts('papermark'))).toBe('https://refer.papermark.com/example')
    expect(officialHttpsUrl('https://refer.papermark.com/example', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://www.descript.com/', hosts('descript'))).not.toBeNull()
    expect(officialHttpsUrl('https://partnerstack.com/d', hosts('descript'))).not.toBeNull()
    expect(officialHttpsUrl('https://awin1.com/c', hosts('writesonic'))).toBeNull()
  })
})
