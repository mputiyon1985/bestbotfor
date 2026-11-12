import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-04'
const SLUGS = [
  'scalekit-agentkit',
  'teamily-ai',
  'testifly',
  'synter',
  'videco',
  'machinemail',
  'context-dev',
  'modelpeers',
] as const

function seed(slug: string) {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('bot scout 2026-11-04', () => {
  it('adds 8 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(8)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(8)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(367)
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
    expect(seed('scalekit-agentkit').category).toBe('Development')
    expect(seed('testifly').category).toBe('Development')
    expect(seed('context-dev').category).toBe('Development')
    expect(seed('synter').category).toBe('Automation')
    expect(seed('teamily-ai').category).toBe('Productivity')
    expect(seed('modelpeers').category).toBe('Productivity')
    expect(seed('videco').category).toBe('AI video')
    expect(seed('machinemail').category).toBe('Automation')
  })

  it('keeps unknown prices null and stores only prices the scout captured', () => {
    expect(seed('scalekit-agentkit')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 99, hasFreeTier: true })
    expect(seed('teamily-ai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('teamily-ai').longDesc).toContain('Paid plan prices were not readable')
    expect(priceLabel(seed('teamily-ai'))).toBe('Free tier, paid plans available')
    expect(seed('testifly')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false })
    expect(seed('synter')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 20, hasFreeTier: false })
    expect(seed('videco')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 9.99, hasFreeTier: false })
    expect(priceLabel(seed('videco'))).toBe('$9.99 and up')
    expect(seed('machinemail')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 9, hasFreeTier: true })
    expect(seed('context-dev')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true })
    expect(seed('modelpeers')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(seed('modelpeers').longDesc).toContain('Pricing is not published')
    expect(priceLabel(seed('modelpeers'))).toBe('Pricing not published')
    expect(seed('synter').longDesc).not.toContain('$0.25')
  })

  it('does not store public promos as reader deals', () => {
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    expect(catalog).not.toContain('FIRDAYOFF30')
    for (const slug of ['videco', 'context-dev'] as const) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
    }
    expect(seed('context-dev').longDesc).toContain("vendor's public pricing")
    expect(seed('videco').longDesc).not.toMatch(/Black Friday|promo code/i)
  })

  it('seeds only Videco as an inactive program, and leaves the approved pair unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot'])
    const videco = seed('videco')
    expect(videco.affiliate).toEqual({
      hasProgram: true,
      network: 'Endorsely',
      sourceUrl: 'https://videco.io/affiliate',
      status: 'inactive',
      commissionNote:
        '50% of subscription revenue from referrals on paid plans, recurring while the referral stays subscribed. Switched off, with no tracking link stored.',
    })
    expect(videco.allowedHosts).toEqual(['videco.io'])
    expect(servesAffiliateLink('videco', null, videco.affiliate.status)).toBe(false)
    expect(servesAffiliateLink('videco', 'https://videco.io/affiliate', 'inactive')).toBe(false)
    for (const slug of SLUGS) {
      if (slug === 'videco') continue
      expect(seed(slug).affiliate, slug).toEqual({
        hasProgram: false,
        network: null,
        sourceUrl: null,
        status: 'none',
        commissionNote: null,
      })
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
      expect(head.location, slug).not.toMatch(/endorsely|im_ref|via=|ref=/)

      const get = await resolveGoRedirect({
        headers: new Headers(),
        ip: '203.0.113.50',
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
      expect(get.location, slug).not.toMatch(/endorsely|im_ref|via=/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
