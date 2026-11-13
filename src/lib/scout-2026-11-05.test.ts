import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-05'
const SLUGS = ['openmail', 'krev-ai', 'cinnamon', 'mailbox-bot', 'rendro'] as const

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

describe('bot scout 2026-11-05', () => {
  it('adds 5 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(5)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(5)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(382)
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
    expect(seed('openmail').category).toBe('Development')
    expect(seed('mailbox-bot').category).toBe('Development')
    expect(seed('krev-ai').category).toBe('Automation')
    expect(seed('cinnamon').category).toBe('Productivity')
    expect(seed('rendro').category).toBe('Productivity')
  })

  it('keeps euro prices null and stores only dollar prices the scout captured', () => {
    expect(seed('openmail')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('openmail').longDesc).toContain('€9')
    expect(priceLabel(seed('openmail'))).toBe('Free tier, paid plans available')
    expect(seed('krev-ai')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false })
    expect(priceLabel(seed('krev-ai'))).toBe('$49 and up')
    expect(seed('cinnamon')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 9.99, hasFreeTier: false })
    expect(priceLabel(seed('cinnamon'))).toBe('$9.99 and up')
    expect(seed('mailbox-bot')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 15, hasFreeTier: false })
    expect(priceLabel(seed('mailbox-bot'))).toBe('$15 and up')
    expect(seed('rendro')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 199, hasFreeTier: false })
    expect(priceLabel(seed('rendro'))).toBe('$199 and up')
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
    expect(seed('openmail').longDesc).toContain("vendor's public offer")
    expect(seed('openmail').longDesc).toContain('€500')
    expect(seed('rendro').longDesc).toContain("vendor's public offer")
    expect(seed('rendro').longDesc).toContain('25 answers')
    expect(seed('cinnamon').longDesc).toContain('not a free plan')
    expect(seed('mailbox-bot').longDesc).toContain('not a free plan')
  })

  it('seeds no affiliate program, and leaves the approved pair unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'])
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, tool.affiliate.status), slug).toBe(false)
      expect(servesAffiliateLink(slug, 'https://www.krev.ai/creators', 'inactive'), slug).toBe(false)
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
