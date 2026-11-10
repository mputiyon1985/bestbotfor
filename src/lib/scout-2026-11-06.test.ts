import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-06'
const SLUGS = ['glasshand', 'rerun', 'maritime', 'living-brain', 'shareofask', 'kosa8', 'rainbrand', 'transcript-dock'] as const

const NONE = {
  hasProgram: false,
  network: null,
  sourceUrl: null,
  status: 'none',
  commissionNote: null,
}

function seed(slug: string) {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('bot scout 2026-11-06', () => {
  it('adds 8 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(8)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(8)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(342)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      const host = new URL(tool.url).hostname
      expect(tool.allowedHosts, slug).toEqual([host])
    }
  })

  it('maps invalid scout categories onto existing ones and leaves valid ones unchanged', () => {
    expect(seed('glasshand').category).toBe('Development')
    expect(seed('maritime').category).toBe('Development')
    expect(seed('living-brain').category).toBe('Development')
    expect(seed('kosa8').category).toBe('Development')
    expect(seed('transcript-dock').category).toBe('Development')
    expect(seed('rerun').category).toBe('Productivity')
    expect(seed('shareofask').category).toBe('Automation')
    expect(seed('rainbrand').category).toBe('Automation')
  })

  it('stores only dollar prices the scout captured', () => {
    expect(seed('glasshand')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 60, hasFreeTier: false })
    expect(priceLabel(seed('glasshand'))).toBe('$60 and up')
    expect(seed('rerun')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true })
    expect(priceLabel(seed('rerun'))).toBe('Free tier, then $29 and up')
    expect(seed('maritime')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 20, hasFreeTier: false })
    expect(priceLabel(seed('maritime'))).toBe('$20 and up')
    expect(seed('maritime').url).toBe('https://maritime.sh')
    expect(seed('maritime').url).not.toContain('maritime.ai')
    expect(seed('living-brain')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(priceLabel(seed('living-brain'))).toBe('$99 and up')
    expect(seed('living-brain').longDesc).toContain('$5')
    expect(seed('shareofask')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false })
    expect(priceLabel(seed('shareofask'))).toBe('$49 and up')
    expect(seed('kosa8')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false })
    expect(priceLabel(seed('kosa8'))).toBe('$29 and up')
    expect(seed('rainbrand')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 20, hasFreeTier: false })
    expect(priceLabel(seed('rainbrand'))).toBe('$20 and up')
    expect(seed('transcript-dock')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true })
    expect(priceLabel(seed('transcript-dock'))).toBe('Free tier, then $19 and up')
  })

  it('does not store public vendor offers as reader deals', () => {
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    expect(catalog).not.toMatch(/BestBotFor code|member code/i)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('maritime').longDesc).toContain("vendor's public offer")
    expect(seed('maritime').longDesc).toContain('$10,000')
    expect(seed('rainbrand').longDesc).toContain("vendor's public offer")
    expect(seed('rainbrand').longDesc).toContain('1,000')
    expect(seed('rerun').longDesc).toContain('not a free plan')
    expect(seed('maritime').longDesc).toContain('not a free plan')
    expect(seed('shareofask').longDesc).toContain('not a free plan')
    expect(seed('kosa8').longDesc).toContain('not a free plan')
    expect(seed('glasshand').longDesc).toContain('No free plan was found')
    expect(seed('living-brain').longDesc).toContain('No free plan was found')
    expect(seed('rainbrand').longDesc).toContain('No free plan was found')
  })

  it('seeds no affiliate program, and leaves the approved pair unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'])
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.affiliate, slug).toEqual(NONE)
      expect(tool.affiliate.hasProgram, slug).toBe(false)
      expect(servesAffiliateLink(slug, null, tool.affiliate.status), slug).toBe(false)
      expect(servesAffiliateLink(slug, 'https://maritime.sh/startups', 'inactive'), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
  })

  it('sends /go for each new tool to that tool’s official URL', async () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const official = `${new URL(tool.url).origin}/`
      const head = resolveHeadGoRedirect(slug)
      expect(head, slug).toMatchObject({ status: 302 })
      if (head.status !== 302) continue
      expect(`${new URL(head.location).origin}${new URL(head.location).pathname}`, slug).toBe(official)
      expect(head.location, slug).not.toMatch(/endorsely|im_ref|via=|ref=|creators/)

      const get = await resolveGoRedirect({
        headers: new Headers(),
        ip: '203.0.113.55',
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
      expect(`${destination.origin}${destination.pathname}`, slug).toBe(official)
      expect(destination.hostname, slug).toBe(tool.allowedHosts[0])
      expect(get.location, slug).not.toMatch(/endorsely|im_ref|via=|creators/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
