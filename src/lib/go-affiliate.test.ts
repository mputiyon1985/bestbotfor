import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { affiliateRedirectUrl, officialHttpsUrl } from './redirect'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink, withUtmParams } from './go-redirect'

vi.mock('@/lib/analytics', () => ({ track: () => {} }))

const cursor = toolSeeds.find((tool) => tool.slug === 'cursor')!

function go(
  affiliateUrl: string | null,
  affiliateStatus = 'inactive',
  network: string | null = null,
  allowedHosts: readonly string[] = cursor.allowedHosts,
) {
  return resolveGoRedirect({
    headers: new Headers(),
    ip: null,
    siteUrl: 'https://bestbotfor.com',
    seedUrl: cursor.url,
    allowedHosts,
    limit: async () => ({ ok: true }),
    loadTool: async () => ({ id: 1, url: cursor.url, affiliateUrl, affiliateStatus, network }),
  })
}

describe('/go affiliate routing', () => {
  const host = new URL(cursor.url).hostname
  const affiliate = `https://${host}/?ref=bestbotfor`

  it('redirects to a reviewed-host affiliate URL only when status is active', async () => {
    const outcome = await go(affiliate, 'active', 'PartnerStack', ['cursor.com', 'cursor.com?ref=bestbotfor'])
    expect(outcome).toMatchObject({
      status: 302,
      location: `${affiliate}&utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct`,
      click: { affiliate: true, programId: 1, subIdParam: 'sid' },
    })
    expect(servesAffiliateLink('cursor', affiliate, 'active')).toBe(false)
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

  it('pins a live tracking path and refuses shared-domain wildcards that have no link yet', () => {
    const elevenPath = 'https://try.elevenlabs.io/8hbaa9knuwda'
    expect(officialHttpsUrl(elevenPath, hosts('elevenlabs'))).toBe(elevenPath)
    expect(officialHttpsUrl('https://try.elevenlabs.io/8hbaa9knuwda/extra', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://try.elevenlabs.io/other', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://try.elevenlabs.io/8hbaa9knuwdaevil', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://partnerstack.com/click', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://acme.partnerstack.com/click', hosts('elevenlabs'))).toBeNull()
    expect(officialHttpsUrl('https://evil.try.elevenlabs.io/8hbaa9knuwda', hosts('elevenlabs'))).toBeNull()
    expect(servesAffiliateLink('elevenlabs', elevenPath, 'active')).toBe(true)
    expect(servesAffiliateLink('elevenlabs', 'https://try.elevenlabs.io/other', 'active')).toBe(false)
    expect(servesAffiliateLink('cursor', elevenPath, 'active')).toBe(false)

    expect(officialHttpsUrl('https://track.sjv.io/c/1', hosts('lovable'))).toBeNull()
    expect(officialHttpsUrl('https://dub.sh/v0', hosts('v0'))).toBeNull()
    expect(officialHttpsUrl('https://partnerstack.com/d', hosts('descript'))).toBeNull()

    const descript = 'https://get.descript.com/mr4pi3y6tp4s'
    expect(hosts('descript')).toEqual(['www.descript.com', 'get.descript.com/mr4pi3y6tp4s'])
    expect(affiliateRedirectUrl(descript, hosts('descript'))).toBe(descript)
    expect(affiliateRedirectUrl('https://get.descript.com/other', hosts('descript'))).toBeNull()
    expect(affiliateRedirectUrl('https://get.descript.com/mr4pi3y6tp4s/extra', hosts('descript'))).toBeNull()
    expect(affiliateRedirectUrl('https://get.descript.com/mr4pi3y6tp4sevil', hosts('descript'))).toBeNull()
    expect(officialHttpsUrl('https://get.descript.com/', hosts('descript'))).toBeNull()
    expect(servesAffiliateLink('descript', descript, 'active')).toBe(true)
    expect(servesAffiliateLink('descript', descript, 'inactive')).toBe(false)

    const murf = 'https://get.murf.ai/pxci5cc1lpk2'
    expect(hosts('murf')).toEqual(['murf.ai', 'get.murf.ai/pxci5cc1lpk2'])
    expect(affiliateRedirectUrl(murf, hosts('murf'))).toBe(murf)
    expect(affiliateRedirectUrl('https://get.murf.ai/other', hosts('murf'))).toBeNull()
    expect(officialHttpsUrl('https://get.murf.ai/', hosts('murf'))).toBeNull()
    expect(servesAffiliateLink('murf', murf, 'active')).toBe(true)
    expect(servesAffiliateLink('murf', murf, 'inactive')).toBe(false)

    const papermark = 'https://refer.papermark.com/mark'
    expect(hosts('papermark')).toEqual(['www.papermark.com', 'refer.papermark.com/mark'])
    expect(affiliateRedirectUrl(papermark, hosts('papermark'))).toBe(papermark)
    expect(officialHttpsUrl('https://refer.papermark.com/example', hosts('papermark'))).toBeNull()
    expect(affiliateRedirectUrl('https://refer.papermark.com/example', hosts('papermark'))).toBeNull()
    expect(officialHttpsUrl('https://refer.papermark.com/markevil', hosts('papermark'))).toBeNull()
    expect(servesAffiliateLink('papermark', papermark, 'active')).toBe(true)
    expect(servesAffiliateLink('papermark', papermark, 'inactive')).toBe(false)
    const synthesia = 'https://www.synthesia.io/?via=mark-putiyon'
    expect(affiliateRedirectUrl(synthesia, hosts('synthesia'))).toBe(synthesia)
    expect(affiliateRedirectUrl('https://www.synthesia.io/?via=other', hosts('synthesia'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.synthesia.io/?via=mark-putiyon&next=1', hosts('synthesia'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.synthesia.io/phish?via=mark-putiyon', hosts('synthesia'))).toBeNull()
    expect(officialHttpsUrl('https://www.synthesia.io/', hosts('synthesia'))).toBe('https://www.synthesia.io/')
  })
})
