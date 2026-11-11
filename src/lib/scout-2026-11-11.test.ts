import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-11'
const SLUGS = ['alsona', 'latch-ai', 'seldon-wren', 'maxma', 'lottiefiles', 'rystic', 'mimzie', 'monity', 'obeya', 'co-review'] as const
const PROGRAMS = ['alsona', 'maxma'] as const

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

describe('bot scout 2026-11-11', () => {
  it('adds 10 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(10)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(10)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(352)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(348)
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
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(seed('alsona').category).toBe('Automation')
    expect(seed('latch-ai').category).toBe('Productivity')
    expect(seed('seldon-wren').category).toBe('Development')
    expect(seed('maxma').category).toBe('Automation')
    expect(seed('lottiefiles').category).toBe('Design')
    expect(seed('rystic').category).toBe('Development')
    expect(seed('mimzie').category).toBe('Productivity')
    expect(seed('monity').category).toBe('Productivity')
    expect(seed('obeya').category).toBe('Development')
    expect(seed('co-review').category).toBe('Development')
    for (const slug of SLUGS) {
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Sales', 'Finance', 'Marketing', 'QA'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('alsona')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(priceLabel(seed('alsona'))).toBe('$99 and up')
    expect(seed('latch-ai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 50, hasFreeTier: true })
    expect(priceLabel(seed('latch-ai'))).toBe('Free tier, then $50 and up')
    expect(priceLabel(seed('latch-ai'))).not.toContain('billed annually')
    expect(seed('seldon-wren')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('seldon-wren'))).toBe('10 free runs, then $3 per completed test run')
    expect(seed('maxma')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(priceLabel(seed('maxma'))).toBe('$99 and up')
    expect(seed('lottiefiles')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 19.99, hasFreeTier: false })
    expect(priceLabel(seed('lottiefiles'))).toBe('$19.99/mo and up, billed annually')
    expect(seed('rystic')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 89.99, hasFreeTier: true })
    expect(priceLabel(seed('rystic'))).toBe('Free tier, then $89.99 and up')
    expect(seed('mimzie')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 8, hasFreeTier: true })
    expect(priceLabel(seed('mimzie'))).toBe('Free tier, then $8 and up')
    expect(seed('monity')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('monity'))).toBe('Free tier, paid plans available')
    expect(seed('obeya')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('obeya'))).toBe('Free')
    expect(seed('co-review')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('co-review'))).toBe('Free')
    expect(seed('monity').longDesc).not.toMatch(/\$\d/)
    expect(`${seed('monity').shortDesc} ${seed('monity').longDesc}`).not.toMatch(/\$\d|Personal \$\d|Business \$\d/)
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('alsona').longDesc).toContain('not a free plan')
    expect(seed('alsona').longDesc).toContain('No free plan was found')
    expect(seed('alsona').longDesc).toContain("vendor's public offer")
    expect(seed('latch-ai').longDesc).toContain("vendor's public billing")
    expect(seed('latch-ai').longDesc).toContain('not the stored from-price')
    expect(seed('seldon-wren').longDesc).toContain('not a monthly plan')
    expect(seed('seldon-wren').longDesc).toContain('free allowance')
    expect(seed('maxma').longDesc).toContain('not a free plan')
    expect(seed('maxma').longDesc).toContain('No free plan was found')
    expect(seed('maxma').longDesc).toContain("vendor's public offer")
    expect(seed('lottiefiles').longDesc).toContain('billed annually')
    expect(seed('lottiefiles').longDesc).toContain('not a free plan')
    expect(seed('lottiefiles').longDesc).toContain('No free plan was found')
    expect(seed('rystic').longDesc).toContain('not a free plan')
    expect(seed('rystic').longDesc).toContain("vendor's public offer")
    expect(seed('mimzie').longDesc).toContain('are not released')
    expect(seed('monity').longDesc).toContain('no paid price is stored')
    expect(seed('obeya').longDesc).toContain('no paid plan')
    expect(seed('co-review').longDesc).toContain('No paid plan was found')
  })

  it('seeds only Alsona and Maxma as inactive programs, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'])
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('alsona').affiliate).toEqual({
      hasProgram: true,
      network: 'Rewardful',
      sourceUrl: 'https://alsona.getrewardful.com/signup',
      status: 'inactive',
      commissionNote: '30% of revenue on full-priced referrals for the customer lifetime, with a 60-day cookie. PayPal payouts. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('maxma').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (via sales)',
      sourceUrl: 'https://maxma.ai/pricing',
      status: 'inactive',
      commissionNote: 'Agency partner program with affiliate terms. Terms are not public. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('alsona').allowedHosts).toEqual(['alsona.com'])
    expect(seed('maxma').allowedHosts).toEqual(['maxma.ai'])
    expect(seed('maxma').affiliate.commissionNote).not.toMatch(/\d+%/)
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
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-11'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
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
      expect(head.location, slug).not.toMatch(/affiliate|rewardful|camp_id|endorsely|im_ref|via=|ref=|creators|sponsored/)

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
      expect(get.location, slug).not.toMatch(/affiliate|rewardful|camp_id|endorsely|im_ref|via=|ref=|creators|sponsored/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
