import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const FRESH = '2026-11-09'
const SLUGS = ['qoder', 'boltai', 'thunderphone', 'cosyra', 'host0', 'ponder'] as const

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

describe('catalog freshness 2026-11-09', () => {
  it('leaves Lindy at the $29.99 Team from-price', () => {
    const lindy = seed('lindy')
    expect(lindy).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 29.99, lastVerifiedAt: '2026-10-15' })
    expect(lindy.longDesc).toContain('$29.99 per user a month for 3,000 credits')
    expect(lindy.longDesc).not.toContain('5,000 credits')
    expect(priceLabel(lindy)).toBe('$29.99 and up')
    expect(lindy.affiliate).toEqual({ ...NONE, status: 'verify' })
  })

  it('leaves Codend as the single main row and does not edit the five review tools', () => {
    const codendRows = toolSeeds.filter((tool) => tool.slug === 'codend')
    expect(codendRows).toHaveLength(1)
    expect(codendRows[0]).toEqual({
      slug: 'codend',
      addedAt: '2026-11-08',
      name: 'Codend',
      vendor: 'Codend',
      url: 'https://codend.dev',
      allowedHosts: ['codend.dev'],
      category: 'Vibe coding',
      shortDesc: 'A browser agent that builds and publishes web apps from a prompt and can open pull requests on GitHub.',
      longDesc:
        'Codend is a browser AI agent that builds, previews and publishes web apps from a prompt. It can take coding tasks on your GitHub repositories, such as bug fixes, tests and dependency upgrades, and hand back a pull request. It also runs scheduled automations and connects to GitHub and Notion. Plus is $8 a month for 800 credits. Pro is $20 a month for 2,000 credits, and it includes GitHub repositories and pull requests. Max is $100 a month for 10,000 credits. Yearly billing saves 15 percent. That discount is the vendor\'s public pricing. It is not the stored from-price. New accounts get 5 credits a day for the first 7 days and 10 welcome credits that do not expire. That allowance is not a free plan. Repository access is only on Pro and Max.',
      pricingModel: 'paid',
      priceFromUsd: 8,
      hasFreeTier: false,
      skillLevel: 'intermediate',
      platforms: ['Web'],
      lastVerifiedAt: '2026-11-08',
      fits: [],
      affiliate: NONE,
    })
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    expect(catalog.match(/slug: 'codend'/g)).toEqual(["slug: 'codend'"])
    expect(seed('runinfra')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 10, lastVerifiedAt: '2026-10-22' })
    expect(seed('tulu')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null, lastVerifiedAt: '2026-10-30' })
    expect(seed('sideos')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null, lastVerifiedAt: '2026-10-24' })
    expect(seed('chatacademia')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null, lastVerifiedAt: '2026-10-26' })
    expect(seed('supercmo')).toMatchObject({ pricingModel: 'free', hasFreeTier: true, priceFromUsd: null, lastVerifiedAt: '2026-10-22' })
  })

  it('adds six unrated tools in categories that already exist', () => {
    const categories = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(new Set(SLUGS).size).toBe(6)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(6)
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
    }
    expect(seed('qoder')).toMatchObject({ category: 'Coding assistant', pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true })
    expect(seed('qoder').longDesc).toContain('Pro is $20 a month')
    expect(seed('qoder').longDesc).not.toMatch(/\$60|\$200/)
    expect(seed('qoder').platforms).toEqual(['Web', 'JetBrains', 'Terminal'])
    expect(priceLabel(seed('qoder'))).toBe('Free tier, then $10 and up')

    expect(seed('boltai')).toMatchObject({ category: 'Productivity', pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(seed('boltai').longDesc).toContain('30-day money-back')
    expect(seed('boltai').longDesc).not.toContain('14-day')
    expect(seed('boltai').longDesc).toContain("vendor's public pricing")
    expect(seed('boltai').priceFromUsd).not.toBe(59)
    expect(priceLabel(seed('boltai'))).toBe('$99 and up')

    expect(seed('thunderphone')).toMatchObject({ category: 'Voice', pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(seed('thunderphone').longDesc).toContain('no flat monthly plan price')
    expect(priceLabel(seed('thunderphone'))).toBe('Paid')

    expect(seed('cosyra')).toMatchObject({ category: 'Development', pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true })
    expect(seed('cosyra').longDesc).toContain('Remote Control')
    expect(seed('cosyra').longDesc).not.toMatch(/Ubuntu|pre-installed/i)
    expect(priceLabel(seed('cosyra'))).toBe('Free tier, then $20 and up')

    expect(seed('host0')).toMatchObject({ category: 'Development', pricingModel: 'freemium', priceFromUsd: 9, hasFreeTier: true })
    expect(seed('host0').longDesc).toContain('$9 a month ($90 a year)')
    expect(priceLabel(seed('host0'))).toBe('Free tier, then $9 and up')

    expect(seed('ponder')).toMatchObject({ category: 'Research', pricingModel: 'freemium', priceFromUsd: 14, hasFreeTier: true })
    expect(seed('ponder').longDesc).toContain('November 4, 2026')
    expect(seed('ponder').longDesc).toContain('September 22, 2026')
    expect(priceLabel(seed('ponder'))).toBe('Free tier, then $14 and up')
  })

  it('does not store a program, a tracking link, or a reader deal', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot'])
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(APPROVED_ACTIVE_AFFILIATES).not.toContain(slug)
      expect(servesAffiliateLink(slug, null, tool.affiliate.status)).toBe(false)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/BestBotFor code|member code|reader deal|exclusive/i)
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
