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

  it('pins a live tracking path and refuses shared-domain wildcards that have no link yet', async () => {
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

    const docsalot = 'https://docsalot.dev/?utm-source=bestbotfor'
    const startup = 'https://buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08'
    const team = 'https://buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07'
    expect(hosts('docsalot')).toEqual([
      'docsalot.dev',
      'docsalot.dev/?utm-source=bestbotfor',
      'buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08',
      'buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07',
    ])
    expect(affiliateRedirectUrl(docsalot, hosts('docsalot'))).toBe(docsalot)
    expect(affiliateRedirectUrl('https://docsalot.dev/?utm-source=other', hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl('https://docsalot.dev/?utm-source=bestbotfor&next=1', hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl('https://docsalot.dev/phish?utm-source=bestbotfor', hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl('https://docs.docsalot.dev/?utm-source=bestbotfor', hosts('docsalot'))).toBeNull()
    expect(officialHttpsUrl('https://docsalot.dev/', hosts('docsalot'))).toBe('https://docsalot.dev/')
    expect(affiliateRedirectUrl(startup, hosts('docsalot'))).toBe(startup)
    expect(affiliateRedirectUrl(team, hosts('docsalot'))).toBe(team)
    expect(affiliateRedirectUrl('https://buy.stripe.com/other', hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl(`${startup}/extra`, hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl(`${startup}evil`, hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl(`${startup}?next=1`, hosts('docsalot'))).toBe(`${startup}?next=1`)
    expect(affiliateRedirectUrl('https://stripe.com/dRmbJ197SdjH3jRa8f2Ji08', hosts('docsalot'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08', hosts('docsalot'))).toBeNull()
    expect(officialHttpsUrl('https://buy.stripe.com/', hosts('docsalot'))).toBeNull()
    expect(officialHttpsUrl(startup, hosts('docsalot'))).toBe(startup)
    expect(servesAffiliateLink('docsalot', docsalot, 'active')).toBe(true)
    expect(servesAffiliateLink('docsalot', docsalot, 'inactive')).toBe(false)
    expect(servesAffiliateLink('docsalot-startup', startup, 'active')).toBe(true)
    expect(servesAffiliateLink('docsalot-team', team, 'active')).toBe(true)
    expect(servesAffiliateLink('docsalot-startup', startup, 'inactive')).toBe(false)
    expect(servesAffiliateLink('docsalot-startup', 'https://buy.stripe.com/other', 'active')).toBe(false)

    const sendr = 'https://sendr.cello.so/LOp5fYtd9Jc'
    expect(hosts('sendr')).toEqual(['www.sendr.ai', 'sendr.cello.so/LOp5fYtd9Jc'])
    expect(affiliateRedirectUrl(sendr, hosts('sendr'))).toBe(sendr)
    expect(affiliateRedirectUrl('https://sendr.cello.so/other', hosts('sendr'))).toBeNull()
    expect(affiliateRedirectUrl('https://sendr.cello.so/LOp5fYtd9Jc/extra', hosts('sendr'))).toBeNull()
    expect(affiliateRedirectUrl('https://sendr.cello.so/LOp5fYtd9Jcevil', hosts('sendr'))).toBeNull()
    expect(affiliateRedirectUrl('https://cello.so/LOp5fYtd9Jc', hosts('sendr'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.sendr.cello.so/LOp5fYtd9Jc', hosts('sendr'))).toBeNull()
    expect(officialHttpsUrl('https://www.sendr.ai/', hosts('sendr'))).toBe('https://www.sendr.ai/')
    expect(officialHttpsUrl('https://sendr.cello.so/', hosts('sendr'))).toBeNull()
    expect(servesAffiliateLink('sendr', sendr, 'active')).toBe(true)
    expect(servesAffiliateLink('sendr', sendr, 'inactive')).toBe(false)
    const julius = 'https://julius.dub.link/mark-putiyon'
    expect(hosts('julius-ai')).toEqual(['julius.ai', 'julius.dub.link/mark-putiyon'])
    expect(affiliateRedirectUrl(julius, hosts('julius-ai'))).toBe(julius)
    expect(affiliateRedirectUrl('https://julius.dub.link/other', hosts('julius-ai'))).toBeNull()
    expect(affiliateRedirectUrl('https://julius.dub.link/mark-putiyon/extra', hosts('julius-ai'))).toBeNull()
    expect(affiliateRedirectUrl('https://julius.dub.link/mark-putiyonevil', hosts('julius-ai'))).toBeNull()
    expect(affiliateRedirectUrl('https://dub.link/mark-putiyon', hosts('julius-ai'))).toBeNull()
    expect(officialHttpsUrl('https://julius.ai/', hosts('julius-ai'))).toBe('https://julius.ai/')
    expect(officialHttpsUrl('https://julius.dub.link/', hosts('julius-ai'))).toBeNull()
    expect(servesAffiliateLink('julius-ai', julius, 'active')).toBe(true)
    expect(servesAffiliateLink('julius', julius, 'active')).toBe(true)
    expect(servesAffiliateLink('julius-ai', julius, 'inactive')).toBe(false)
    const context = 'https://link.context.dev/mark-putiyon'
    expect(hosts('context-dev')).toEqual(['context.dev', 'link.context.dev/mark-putiyon'])
    expect(affiliateRedirectUrl(context, hosts('context-dev'))).toBe(context)
    expect(affiliateRedirectUrl('https://link.context.dev/other', hosts('context-dev'))).toBeNull()
    expect(affiliateRedirectUrl('https://link.context.dev/mark-putiyon/extra', hosts('context-dev'))).toBeNull()
    expect(affiliateRedirectUrl('https://link.context.dev/mark-putiyonevil', hosts('context-dev'))).toBeNull()
    expect(affiliateRedirectUrl('https://context.dev/mark-putiyon', hosts('context-dev'))).toBeNull()
    expect(officialHttpsUrl('https://context.dev/', hosts('context-dev'))).toBe('https://context.dev/')
    expect(officialHttpsUrl('https://link.context.dev/', hosts('context-dev'))).toBeNull()
    expect(servesAffiliateLink('context-dev', context, 'active')).toBe(true)
    expect(servesAffiliateLink('context-dev', context, 'inactive')).toBe(false)
    const getimg = 'https://refer.getimg.ai/mark-putiyon'
    expect(hosts('getimg')).toEqual(['getimg.ai', 'refer.getimg.ai/mark-putiyon'])
    expect(affiliateRedirectUrl(getimg, hosts('getimg'))).toBe(getimg)
    expect(affiliateRedirectUrl('https://refer.getimg.ai/other', hosts('getimg'))).toBeNull()
    expect(affiliateRedirectUrl('https://refer.getimg.ai/mark-putiyon/extra', hosts('getimg'))).toBeNull()
    expect(affiliateRedirectUrl('https://refer.getimg.ai/mark-putiyonevil', hosts('getimg'))).toBeNull()
    expect(affiliateRedirectUrl('https://getimg.ai/mark-putiyon', hosts('getimg'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.refer.getimg.ai/mark-putiyon', hosts('getimg'))).toBeNull()
    expect(officialHttpsUrl('https://getimg.ai/', hosts('getimg'))).toBe('https://getimg.ai/')
    expect(officialHttpsUrl('https://refer.getimg.ai/', hosts('getimg'))).toBeNull()
    expect(servesAffiliateLink('getimg', getimg, 'active')).toBe(true)
    expect(servesAffiliateLink('getimg', getimg, 'inactive')).toBe(false)
    const { OutboundLink } = await import('@/components/outbound-link')
    const getimgVisit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'getimg', affiliate: true, children: 'Visit getimg.ai' }))
    expect(getimgVisit).toContain('href="/go/getimg"')
    expect(getimgVisit).toContain('rel="sponsored nofollow noopener"')
    expect(toolSeeds.find((tool) => tool.slug === 'getimg')?.affiliate.commissionNote).toBe('Up to 30% per sale for 1 year.')
    const rankfender = 'https://rankfender.com/r/mark'
    expect(hosts('rankfender')).toEqual(['rankfender.com', 'rankfender.com/r/mark'])
    expect(affiliateRedirectUrl(rankfender, hosts('rankfender'))).toBe(rankfender)
    expect(affiliateRedirectUrl('https://rankfender.com/r/other', hosts('rankfender'))).toBeNull()
    expect(affiliateRedirectUrl('https://rankfender.com/r/mark/extra', hosts('rankfender'))).toBeNull()
    expect(affiliateRedirectUrl('https://rankfender.com/r/markevil', hosts('rankfender'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.rankfender.com/r/mark', hosts('rankfender'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.rankfender.com/r/mark', hosts('rankfender'))).toBeNull()
    expect(affiliateRedirectUrl('https://rankfender.com/', hosts('rankfender'))).toBeNull()
    expect(officialHttpsUrl('https://rankfender.com/', hosts('rankfender'))).toBe('https://rankfender.com/')
    expect(servesAffiliateLink('rankfender', rankfender, 'active')).toBe(true)
    expect(servesAffiliateLink('rankfender', rankfender, 'inactive')).toBe(false)
    const rankfenderVisit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'rankfender', affiliate: true, children: 'Visit Rankfender' }))
    expect(rankfenderVisit).toContain('href="/go/rankfender"')
    expect(rankfenderVisit).toContain('rel="sponsored nofollow noopener"')
    const { AffiliateDisclosure, AffiliatePageNotice } = await import('@/components/affiliate-disclosure')
    const { AFFILIATE_BUTTON_NOTE, AFFILIATE_PAGE_NOTICE } = await import('@/lib/affiliate-copy')
    const rankfenderNote = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'Rankfender' }))
    expect(rankfenderNote).toContain(AFFILIATE_BUTTON_NOTE)
    expect(rankfenderNote).toContain('data-affiliate-disclosure="affiliate"')
    expect(rankfenderNote).toContain('href="/disclosure"')
    const rankfenderPage = renderToStaticMarkup(createElement(AffiliatePageNotice, { active: true }))
    expect(rankfenderPage).toContain(AFFILIATE_PAGE_NOTICE)
    expect(rankfenderPage).toContain('data-affiliate-page-notice')
    expect(toolSeeds.find((tool) => tool.slug === 'rankfender')?.affiliate.commissionNote).toBe(
      '30% of subscription payments for 12 months, with a 90-day cookie.',
    )
    const polylane = 'https://go.polylane.com/mark-putiyon'
    expect(hosts('polylane')).toEqual(['polylane.com', 'go.polylane.com/mark-putiyon'])
    expect(affiliateRedirectUrl(polylane, hosts('polylane'))).toBe(polylane)
    expect(affiliateRedirectUrl('https://go.polylane.com/other', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://go.polylane.com/mark-putiyon/extra', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://go.polylane.com/mark-putiyonevil', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://polylane.com/mark-putiyon', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.go.polylane.com/mark-putiyon', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.go.polylane.com/mark-putiyon', hosts('polylane'))).toBeNull()
    expect(affiliateRedirectUrl('https://polylane.com/', hosts('polylane'))).toBeNull()
    expect(officialHttpsUrl('https://polylane.com/', hosts('polylane'))).toBe('https://polylane.com/')
    expect(officialHttpsUrl('https://go.polylane.com/', hosts('polylane'))).toBeNull()
    expect(servesAffiliateLink('polylane', polylane, 'active')).toBe(true)
    expect(servesAffiliateLink('polylane', polylane, 'inactive')).toBe(false)
    const polylaneVisit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'polylane', affiliate: true, children: 'Visit Polylane' }))
    expect(polylaneVisit).toContain('href="/go/polylane"')
    expect(polylaneVisit).toContain('rel="sponsored nofollow noopener"')
    const polylaneNote = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'Polylane' }))
    expect(polylaneNote).toContain(AFFILIATE_BUTTON_NOTE)
    expect(polylaneNote).toContain('data-affiliate-disclosure="affiliate"')
    expect(polylaneNote).toContain('href="/disclosure"')
    const polylanePage = renderToStaticMarkup(createElement(AffiliatePageNotice, { active: true }))
    expect(polylanePage).toContain(AFFILIATE_PAGE_NOTICE)
    expect(polylanePage).toContain('data-affiliate-page-notice')
    expect(toolSeeds.find((tool) => tool.slug === 'polylane')?.affiliate.commissionNote).toBe('15% of each sale for 1 year.')
    const snapdub = 'https://snapdub.ai/?via=bestbotfor'
    expect(hosts('snapdub')).toEqual(['snapdub.ai', 'snapdub.ai/?via=bestbotfor'])
    expect(affiliateRedirectUrl('https://snapdub.ai?via=bestbotfor', hosts('snapdub'))).toBe(snapdub)
    expect(affiliateRedirectUrl(snapdub, hosts('snapdub'))).toBe(snapdub)
    expect(affiliateRedirectUrl('https://snapdub.ai/?via=other', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://snapdub.ai/?via=bestbotfor&next=1', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://snapdub.ai/phish?via=bestbotfor', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://snapdub.ai/?via=bestbotforevil', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.snapdub.ai/?via=bestbotfor', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://evil.snapdub.ai/?via=bestbotfor', hosts('snapdub'))).toBeNull()
    expect(affiliateRedirectUrl('https://snapdub.ai/', hosts('snapdub'))).toBeNull()
    expect(officialHttpsUrl('https://snapdub.ai/', hosts('snapdub'))).toBe('https://snapdub.ai/')
    expect(officialHttpsUrl('https://snapdub.ai/?via=bestbotfor', hosts('snapdub'))).toBe(snapdub)
    expect(servesAffiliateLink('snapdub', 'https://snapdub.ai?via=bestbotfor', 'active')).toBe(true)
    expect(servesAffiliateLink('snapdub', 'https://snapdub.ai?via=bestbotfor', 'inactive')).toBe(false)
    expect(servesAffiliateLink('snapdub', 'https://snapdub.ai/affiliate', 'active')).toBe(false)
    const snapdubVisit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'snapdub', affiliate: true, children: 'Visit SnapDub' }))
    expect(snapdubVisit).toContain('href="/go/snapdub"')
    expect(snapdubVisit).toContain('rel="sponsored nofollow noopener"')
    const snapdubNote = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'SnapDub' }))
    expect(snapdubNote).toContain(AFFILIATE_BUTTON_NOTE)
    expect(snapdubNote).toContain('data-affiliate-disclosure="affiliate"')
    expect(snapdubNote).toContain('href="/disclosure"')
    const snapdubPage = renderToStaticMarkup(createElement(AffiliatePageNotice, { active: true }))
    expect(snapdubPage).toContain(AFFILIATE_PAGE_NOTICE)
    expect(snapdubPage).toContain('data-affiliate-page-notice')
    expect(toolSeeds.find((tool) => tool.slug === 'snapdub')?.affiliate.commissionNote).toBe(
      '30% of each sale for 12 months (90-day cookie).',
    )
    const videco = 'https://videco.io/?via=mark276'
    expect(hosts('videco')).toEqual(['videco.io', 'videco.io/?via=mark276'])
    expect(affiliateRedirectUrl('https://videco.io?via=mark276', hosts('videco'))).toBe(videco)
    expect(affiliateRedirectUrl(videco, hosts('videco'))).toBe(videco)
    expect(affiliateRedirectUrl('https://videco.io/?via=other', hosts('videco'))).toBeNull()
    expect(affiliateRedirectUrl('https://videco.io/?via=mark276&next=1', hosts('videco'))).toBeNull()
    expect(affiliateRedirectUrl('https://videco.io/phish?via=mark276', hosts('videco'))).toBeNull()
    expect(affiliateRedirectUrl('https://videco.io/?via=mark276evil', hosts('videco'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.videco.io/?via=mark276', hosts('videco'))).toBeNull()
    expect(officialHttpsUrl('https://videco.io/', hosts('videco'))).toBe('https://videco.io/')
    expect(affiliateRedirectUrl('https://videco.io/', hosts('videco'))).toBeNull()
    expect(officialHttpsUrl('https://videco.io/?via=mark276', hosts('videco'))).toBe(videco)
    expect(servesAffiliateLink('videco', 'https://videco.io?via=mark276', 'active')).toBe(true)
    expect(servesAffiliateLink('videco', 'https://videco.io?via=mark276', 'inactive')).toBe(false)
    expect(servesAffiliateLink('videco', 'https://videco.io/affiliate', 'active')).toBe(false)
    const synthesia = 'https://www.synthesia.io/?via=mark-putiyon'
    expect(affiliateRedirectUrl(synthesia, hosts('synthesia'))).toBe(synthesia)
    expect(affiliateRedirectUrl('https://www.synthesia.io/?via=other', hosts('synthesia'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.synthesia.io/?via=mark-putiyon&next=1', hosts('synthesia'))).toBeNull()
    expect(affiliateRedirectUrl('https://www.synthesia.io/phish?via=mark-putiyon', hosts('synthesia'))).toBeNull()
    expect(officialHttpsUrl('https://www.synthesia.io/', hosts('synthesia'))).toBe('https://www.synthesia.io/')
  })
})
