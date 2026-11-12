import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-08'
const SLUGS = ['livereview', 'quest-advisor', 'vondet', 'keycontain', 'codend', 'seam-notch', 'churnproof', 'spot-deemwar'] as const

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

describe('bot scout 2026-11-08', () => {
  it('adds 8 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(8)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(8)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(366)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.affiliate, slug).toEqual(NONE)
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      const host = new URL(tool.url).hostname
      expect(tool.allowedHosts, slug).toEqual([host])
    }
  })

  it('keeps scout categories that already exist in the catalog', () => {
    expect(seed('livereview').category).toBe('Coding assistant')
    expect(seed('quest-advisor').category).toBe('Chat assistant')
    expect(seed('vondet').category).toBe('Productivity')
    expect(seed('keycontain').category).toBe('Development')
    expect(seed('codend').category).toBe('Vibe coding')
    expect(seed('seam-notch').category).toBe('Productivity')
    expect(seed('churnproof').category).toBe('Automation')
    expect(seed('spot-deemwar').category).toBe('Productivity')
  })

  it('stores only dollar prices the scout captured, and leaves AUD unset', () => {
    expect(seed('livereview')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 32, hasFreeTier: true })
    expect(priceLabel(seed('livereview'))).toBe('Free tier, then $32 and up')
    expect(seed('quest-advisor')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('quest-advisor'))).toBe('Free')
    expect(seed('vondet')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 18, hasFreeTier: true })
    expect(priceLabel(seed('vondet'))).toBe('Free tier, then $18 and up')
    expect(seed('keycontain')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 0.5, hasFreeTier: true })
    expect(priceLabel(seed('keycontain'))).toBe('Free tier, then $0.50 and up')
    expect(seed('codend')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 8, hasFreeTier: false })
    expect(priceLabel(seed('codend'))).toBe('$8 and up')
    expect(seed('seam-notch')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 19.9, hasFreeTier: false })
    expect(priceLabel(seed('seam-notch'))).toBe('$19.90 and up')
    expect(seed('churnproof')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('churnproof'))).toBe('Free tier, paid plans available')
    expect(seed('spot-deemwar')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('spot-deemwar'))).toBe('Free')
  })

  it('keeps Churnproof in AUD, excluding GST, for Australia and Xero only', () => {
    const copy = `${seed('churnproof').shortDesc} ${seed('churnproof').longDesc}`
    expect(copy).toContain('AUD')
    expect(copy).toContain('exclude GST')
    expect(copy).toContain('Australia')
    expect(copy).toContain('Xero')
    expect(copy).not.toMatch(/USD|US dollars/i)
    expect(seed('churnproof').priceFromUsd).toBeNull()
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
    expect(seed('seam-notch').longDesc).toContain("vendor's public offer")
    expect(seed('seam-notch').longDesc).toContain('not a free plan')
    expect(seed('codend').longDesc).toContain("vendor's public pricing")
    expect(seed('codend').longDesc).toContain('not a free plan')
    expect(seed('vondet').longDesc).toContain("vendor's public pricing")
    expect(seed('vondet').longDesc).toContain('$180 a year')
    expect(seed('vondet').priceFromUsd).toBe(18)
    expect(seed('quest-advisor').longDesc).toContain('No paid plan is listed')
    expect(seed('spot-deemwar').longDesc).toContain('No paid Spot plan is listed')
    expect(seed('livereview').longDesc).toContain('The free plan is $0')
    expect(seed('keycontain').longDesc).toContain('The free allowance is $0')
  })

  it('seeds no program, including Codend, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(seed(slug).affiliate.hasProgram, slug).toBe(false)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
      expect(servesAffiliateLink(slug, 'https://example.com/?ref=bestbotfor', 'inactive'), slug).toBe(false)
    }
    expect(seed('codend').affiliate.sourceUrl).toBeNull()
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const codend = catalog.slice(catalog.indexOf("slug: 'codend'"), catalog.indexOf("slug: 'seam-notch'"))
    expect(codend).not.toMatch(/affiliateUrl|hasProgram:\s*true|\/affiliates/)
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    expect(seed('pauta')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 5, hasFreeTier: false, addedAt: '2026-11-07' })
    expect(seed('crystl').affiliate.hasProgram).toBe(true)
    expect(seed('crystl').affiliate.status).toBe('inactive')
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
