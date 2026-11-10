import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-10'
const SLUGS = ['dageno-ai', 'databox', 'cardboard-ai', 'arcjet', 'mcp1', 'thrum', 'voyager-fm'] as const
const PROGRAMS = ['dageno-ai', 'databox'] as const

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

describe('bot scout 2026-11-10', () => {
  it('adds 7 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(7)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(7)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(342)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.needsVerification, slug).toBeFalsy()
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      const host = new URL(tool.url).hostname
      expect(tool.allowedHosts, slug).toEqual([host])
    }
  })

  it('maps missing scout categories onto existing ones and leaves valid ones unchanged', () => {
    expect(seed('dageno-ai').category).toBe('SEO')
    expect(seed('databox').category).toBe('Research')
    expect(seed('cardboard-ai').category).toBe('Video editing')
    expect(seed('arcjet').category).toBe('Development')
    expect(seed('mcp1').category).toBe('Development')
    expect(seed('thrum').category).toBe('Development')
    expect(seed('voyager-fm').category).toBe('Productivity')
    for (const slug of SLUGS) {
      expect(['Marketing', 'Analytics', 'Video', 'Security'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('dageno-ai')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false })
    expect(priceLabel(seed('dageno-ai'))).toBe('$49 and up')
    expect(seed('databox')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 499, hasFreeTier: false })
    expect(priceLabel(seed('databox'))).toBe('$499 and up')
    expect(seed('cardboard-ai')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 10, hasFreeTier: false })
    expect(priceLabel(seed('cardboard-ai'))).toBe('$10 and up')
    expect(seed('arcjet')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false })
    expect(priceLabel(seed('arcjet'))).toBe('$25 and up')
    expect(seed('mcp1')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('mcp1'))).toBe('Pricing not published')
    expect(seed('thrum')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true })
    expect(priceLabel(seed('thrum'))).toBe('Free tier, then $15 and up')
    expect(seed('voyager-fm')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('voyager-fm'))).toBe('Free; Plus and Pro not available yet')
    expect(`${seed('mcp1').shortDesc} ${seed('mcp1').longDesc}`).not.toMatch(/\$12|\$29|per member|free for individuals/i)
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('dageno-ai').longDesc).toContain('not a free plan')
    expect(seed('dageno-ai').longDesc).toContain('No free plan was found')
    expect(seed('databox').longDesc).toContain('No free plan was found')
    expect(seed('databox').longDesc).toContain("vendor's public billing")
    expect(seed('cardboard-ai').longDesc).toContain("vendor's public pricing")
    expect(seed('cardboard-ai').longDesc).toContain('No free plan was found')
    expect(seed('arcjet').longDesc).toContain('not a free plan')
    expect(seed('thrum').longDesc).toContain("vendor's public offers")
    expect(seed('thrum').longDesc).toContain('not a free plan')
    expect(seed('thrum').longDesc).toContain('Pro purchasing is not open yet')
    expect(seed('voyager-fm').longDesc).toContain('not available yet')
    expect(seed('voyager-fm').longDesc).toContain("vendor's public offer")
    expect(seed('voyager-fm').priceFromUsd).toBeNull()
  })

  it('seeds only Dageno AI and Databox as inactive programs, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'])
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('dageno-ai').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (affiliate.dageno.ai)',
      sourceUrl: 'https://affiliate.dageno.ai/auth/register',
      status: 'inactive',
      commissionNote: '30% of the first payment, then 10-30% on each renewal. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('databox').affiliate).toEqual({
      hasProgram: true,
      network: 'FirstPromoter (also PartnerStack per its page)',
      sourceUrl: 'https://databox.com/affiliate-program',
      status: 'inactive',
      commissionNote: '20% recurring for 12 months, with a 90-day cookie. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('dageno-ai').allowedHosts).toEqual(['dageno.ai'])
    expect(seed('databox').allowedHosts).toEqual(['databox.com'])
    for (const slug of PROGRAMS) {
      const tool = seed(slug)
      expect(servesAffiliateLink(slug, null, tool.affiliate.status), slug).toBe(false)
      expect(servesAffiliateLink(slug, tool.affiliate.sourceUrl, 'inactive'), slug).toBe(false)
      expect(servesAffiliateLink(slug, `${tool.url}/?ref=bestbotfor`, 'inactive'), slug).toBe(false)
    }
    for (const slug of SLUGS) {
      if (PROGRAMS.includes(slug as (typeof PROGRAMS)[number])) continue
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-10'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('partnerstack.com')
    expect(scoutBlock).not.toMatch(/\$12\/member|\$29\/member|per member|free for individuals/)
  })

  it('sends /go for each new tool to that tool’s official URL', async () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const official = new URL(tool.url)
      const officialPath = `${official.origin}${official.pathname}`
      const head = resolveHeadGoRedirect(slug)
      expect(head, slug).toMatchObject({ status: 302 })
      if (head.status !== 302) continue
      expect(`${new URL(head.location).origin}${new URL(head.location).pathname}`, slug).toBe(officialPath)
      expect(head.location, slug).not.toMatch(/affiliate|firstpromoter|camp_id|endorsely|im_ref|via=|ref=|creators|sponsored/)

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
      expect(`${destination.origin}${destination.pathname}`, slug).toBe(officialPath)
      expect(destination.hostname, slug).toBe(tool.allowedHosts[0])
      expect(get.location, slug).not.toMatch(/affiliate|firstpromoter|camp_id|endorsely|im_ref|via=|ref=|creators|sponsored/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
