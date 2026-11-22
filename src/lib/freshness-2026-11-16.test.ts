import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const FRESH = '2026-11-16'
const SLUGS = ['raven', 'beeble', 'nod', 'captureflow', 'tk-medium'] as const

const NONE = {
  hasProgram: false,
  network: null,
  sourceUrl: null,
  status: 'none',
  commissionNote: null,
}

const seed = (slug: string) => {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('catalog freshness 2026-11-16', () => {
  it('updates the four from-prices and leaves Lindy and RunInfra alone', () => {
    expect(seed('composio')).toMatchObject({ pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 18, lastVerifiedAt: FRESH })
    expect(priceLabel(seed('composio'))).toBe('Free tier, then $18 and up')
    expect(seed('composio').longDesc).not.toMatch(/\$29/)

    expect(seed('pulsedev')).toMatchObject({ pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 12, lastVerifiedAt: FRESH })
    expect(seed('pulsedev').longDesc).toContain('Pro is $12 a month, or $96 a year')
    expect(seed('pulsedev').longDesc).not.toContain('$18')
    expect(priceLabel(seed('pulsedev'))).toBe('Free tier, then $12 and up')

    expect(seed('sendr')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 99, lastVerifiedAt: FRESH })
    expect(seed('sendr').longDesc).toContain('Monthly is $99')
    expect(seed('sendr').longDesc).toContain('Annual billing is $79 a month')
    expect(seed('sendr').longDesc).not.toMatch(/\$119|\$1,199|stored from-price/)
    expect(priceLabel(seed('sendr'))).toBe('$99 and up')
    expect(seed('sendr').affiliate.status).toBe('active')

    expect(seed('futureproof')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 300, lastVerifiedAt: FRESH })
    expect(priceLabel(seed('futureproof'))).toBe('$300 and up')

    expect(seed('lindy')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 29.99, lastVerifiedAt: '2026-10-15' })
    expect(seed('runinfra')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 10, lastVerifiedAt: '2026-10-22' })
  })

  it('keeps rendered pros, cons, and descriptions off the old from-prices', () => {
    const catalog = catalogFromSeeds()
    const stale: Record<string, RegExp> = {
      composio: /\$29(?!\d)/,
      pulsedev: /\$18(?!\d)/,
      sendr: /\$119\b|\$1,199/,
      futureproof: /\$1,000|\$1000/,
    }
    for (const [slug, pattern] of Object.entries(stale)) {
      const tool = catalog.tools.find((item) => item.slug === slug)
      expect(tool, slug).toBeTruthy()
      if (!tool) continue
      const rendered = [
        tool.shortDesc,
        tool.longDesc,
        tool.editorial?.rationale ?? '',
        ...tool.pros.map((point) => point.text),
        ...tool.cons.map((point) => point.text),
      ].join('\n')
      expect(rendered, slug).not.toMatch(pattern)
    }
    const composio = catalog.tools.find((item) => item.slug === 'composio')
    expect(composio?.pros.map((point) => point.text)).toContain('Standard is $18 per seat a month and includes $18 of usage credit')
  })

  it('adds five unrated tools in categories that already exist', () => {
    const categories = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(new Set(SLUGS).size).toBe(5)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(5)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(1113)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(1109)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(FRESH)
      expect(tool.lastVerifiedAt, slug).toBe(FRESH)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeUndefined()
      expect(tool.affiliate, slug).toEqual(NONE)
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(categories.has(tool.category), slug).toBe(true)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.allowedHosts, slug).toEqual([new URL(tool.url).hostname])
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/stored from-price|promo code|BestBotFor code|reader deal/i)
    }
    expect(seed('raven')).toMatchObject({ category: 'Chat assistant', pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true })
    expect(priceLabel(seed('raven'))).toBe('Free tier, then $20 and up')
    expect(seed('beeble')).toMatchObject({ category: 'AI video', pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true })
    expect(priceLabel(seed('beeble'))).toBe('Free tier, then $19 and up')
    expect(seed('nod')).toMatchObject({ category: 'Automation', pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('nod'))).toBe('Free')
    expect(seed('captureflow')).toMatchObject({ category: 'Productivity', pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true })
    expect(priceLabel(seed('captureflow'))).toBe('Free tier, then $5 and up')
    expect(seed('tk-medium')).toMatchObject({
      name: 'TK by Medium',
      vendor: 'Medium',
      url: 'https://tk.xyz',
      category: 'Writing',
      pricingModel: 'free',
      priceFromUsd: null,
      hasFreeTier: true,
      platforms: ['Web'],
    })
    expect(seed('tk-medium').url).not.toBe('https://medium.com')
    expect(seed('tk-medium').allowedHosts).toEqual(['tk.xyz'])
    expect(priceLabel(seed('tk-medium'))).toBe('Free')
  })

  it('does not store a program, a tracking link, or a reader deal', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane', 'snapdub'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES).not.toContain(slug)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status)).toBe(false)
    }
  })

  it('sends /go for each new tool to that tool’s official URL', async () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const official = new URL(tool.url)
      const head = resolveHeadGoRedirect(slug)
      expect(head, slug).toMatchObject({ status: 302 })
      if (head.status !== 302) continue
      expect(new URL(head.location).hostname, slug).toBe(official.hostname)
      expect(head.location, slug).not.toMatch(/affiliates|endorsely|im_ref|via=|ref=/)

      const get = await resolveGoRedirect({
        headers: new Headers(),
        ip: '203.0.113.57',
        siteUrl: 'https://bestbotfor.com',
        seedUrl: tool.url,
        seedAffiliateUrl: tool.affiliate.affiliateUrl ?? null,
        seedAffiliateStatus: tool.affiliate.status,
        allowedHosts: tool.allowedHosts,
        limit: async () => ({ ok: true }),
        loadTool: async () => ({ id: 1, url: tool.url, affiliateUrl: null, affiliateStatus: tool.affiliate.status }),
      })
      expect(get.status, slug).toBe(302)
      if (get.status !== 302) continue
      const destination = new URL(get.location)
      expect(destination.hostname, slug).toBe(official.hostname)
      expect(`${destination.origin}${destination.pathname}`, slug).toBe(`${official.origin}${official.pathname}`)
      expect(get.click?.affiliate, slug).toBe(false)
    }
  })
})
