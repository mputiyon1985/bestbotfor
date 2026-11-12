import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-07'
const SLUGS = ['tobira', 'turnstone', 'rankfender', 'crystl', 'nico', 'glass-editor', 'pauta', 'infinity-chat'] as const

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

describe('bot scout 2026-11-07', () => {
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
    expect(seed('tobira').category).toBe('Agent builder')
    expect(seed('turnstone').category).toBe('Productivity')
    expect(seed('rankfender').category).toBe('SEO')
    expect(seed('crystl').category).toBe('Development')
    expect(seed('nico').category).toBe('Productivity')
    expect(seed('glass-editor').category).toBe('AI video')
    expect(seed('pauta').category).toBe('Meetings')
    expect(seed('infinity-chat').category).toBe('Productivity')
  })

  it('stores only dollar prices the scout captured', () => {
    expect(seed('tobira')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true })
    expect(priceLabel(seed('tobira'))).toBe('Free tier, then $49 and up')
    expect(seed('turnstone')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true })
    expect(priceLabel(seed('turnstone'))).toBe('Free tier, then $49 and up')
    expect(seed('rankfender')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 89, hasFreeTier: false })
    expect(priceLabel(seed('rankfender'))).toBe('$89 and up')
    expect(seed('crystl')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 18, hasFreeTier: true })
    expect(priceLabel(seed('crystl'))).toBe('Free tier, then $18 and up')
    expect(seed('nico')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true })
    expect(priceLabel(seed('nico'))).toBe('Free tier, then $15 and up')
    expect(seed('glass-editor')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true })
    expect(priceLabel(seed('glass-editor'))).toBe('Free tier, then $15 and up')
    expect(seed('pauta')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 5, hasFreeTier: false })
    expect(priceLabel(seed('pauta'))).toBe('$5 and up')
    expect(seed('infinity-chat')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('infinity-chat'))).toBe('Free')
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
    expect(seed('turnstone').longDesc).toContain("vendor's public offer")
    expect(seed('turnstone').longDesc).toContain('not a free plan')
    expect(seed('glass-editor').longDesc).toContain("vendor's public pricing")
    expect(seed('pauta').longDesc).toContain("vendor's public pricing")
    expect(seed('pauta').longDesc).toContain('not a free plan')
    expect(seed('nico').longDesc).toContain('not a free plan')
    expect(seed('rankfender').longDesc).toContain('No free plan was found')
    expect(seed('infinity-chat').longDesc).toContain('No paid Infinity plan is listed')
    expect(`${seed('crystl').shortDesc} ${seed('crystl').longDesc}`).not.toMatch(/20%|affiliate code/i)
  })

  it('seeds only crystl as an inactive program, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'])
    expect(APPROVED_ACTIVE_AFFILIATES).not.toContain('crystl')
    const crystl = seed('crystl')
    expect(crystl.affiliate).toEqual({
      hasProgram: true,
      network: 'in-house',
      sourceUrl: 'https://crystl.dev/affiliates/',
      status: 'inactive',
      commissionNote:
        '25% of every Guild membership referred, recurring on renewals, with 60-day attribution, as stated on the affiliate page. Not applied or accepted. No tracking link stored.',
    })
    expect(crystl.allowedHosts).toEqual(['crystl.dev'])
    expect(servesAffiliateLink('crystl', null, crystl.affiliate.status)).toBe(false)
    expect(servesAffiliateLink('crystl', 'https://crystl.dev/affiliates/', 'inactive')).toBe(false)
    expect(servesAffiliateLink('crystl', 'https://crystl.dev/?ref=bestbotfor', 'inactive')).toBe(false)
    for (const slug of SLUGS) {
      if (slug === 'crystl') continue
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
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
      expect(head.location, slug).not.toMatch(/affiliates|endorsely|im_ref|via=|ref=|creators/)

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
      expect(get.location, slug).not.toMatch(/affiliates|endorsely|im_ref|via=|creators/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
