import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-03'
const SLUGS = [
  'beacon-sh',
  'unleashx',
  'xmind',
  'cedric-ai',
  'hera',
  'clayzo',
  'screen-studio',
  'clawsgo-science',
  'riverside-agents',
  'embage',
  'hyperresearch',
  'momentic',
  'greta-sh',
  'display-dev',
  'agent-inbox',
] as const

const INACTIVE = ['xmind', 'screen-studio', 'riverside-agents'] as const

function seed(slug: string) {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('bot scout 2026-11-03', () => {
  it('adds 15 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(15)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(15)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
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
    expect(seed('beacon-sh').category).toBe('Development')
    expect(seed('momentic').category).toBe('Development')
    expect(seed('embage').category).toBe('Agent builder')
    expect(seed('greta-sh').category).toBe('Site builder')
    expect(seed('unleashx').category).toBe('Automation')
    expect(seed('agent-inbox').category).toBe('Automation')
    expect(seed('xmind').category).toBe('Productivity')
    expect(seed('display-dev').category).toBe('Productivity')
    expect(seed('cedric-ai').category).toBe('Meetings')
    expect(seed('hera').category).toBe('Design')
    expect(seed('clayzo').category).toBe('Design')
    expect(seed('screen-studio').category).toBe('AI video')
    expect(seed('riverside-agents').category).toBe('AI video')
    expect(seed('clawsgo-science').category).toBe('Research')
    expect(seed('hyperresearch').category).toBe('Research')
  })

  it('keeps unknown prices null and stores only prices the scout actually captured', () => {
    expect(seed('beacon-sh')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(seed('clayzo')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(seed('unleashx')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('xmind')).toMatchObject({ name: 'Xmind', pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('hera')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('hera'))).toBe('Free tier, paid plans available')
    expect(seed('greta-sh')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('hyperresearch')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(seed('hyperresearch').longDesc).toContain('Light is $9 per run')
    expect(seed('hyperresearch').longDesc).toContain('Deep is $49 per run')
    expect(seed('hyperresearch').longDesc).toContain('after a card is added')
    expect(priceLabel(seed('hyperresearch'))).toBe('$9 per run and up')
    expect(seed('agent-inbox')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('agent-inbox').longDesc).toContain('100 conversations a month')
    expect(priceLabel(seed('agent-inbox'))).toBe('Free tier, paid plans available')
    expect(seed('screen-studio').name).toBe('Screen Studio')
    expect(seed('display-dev').name).toBe('Display')
    expect(seed('cedric-ai').priceFromUsd).toBe(19)
    expect(seed('screen-studio')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false })
    expect(seed('clawsgo-science').priceFromUsd).toBe(9.9)
    expect(seed('riverside-agents').priceFromUsd).toBe(29)
    expect(seed('embage').priceFromUsd).toBe(19)
    expect(seed('momentic').priceFromUsd).toBe(125)
    expect(seed('display-dev').priceFromUsd).toBe(12)
    expect(seed('xmind').longDesc).toContain('Pro price was not readable')
    expect(seed('greta-sh').longDesc).not.toContain('$50')
    expect(seed('greta-sh').longDesc).not.toContain('$200')
    expect(seed('momentic').longDesc).not.toContain('$250')
    expect(seed('clayzo').longDesc).not.toContain('npx')
  })

  it('seeds only the three unapproved programs as inactive, with no tracking URL', () => {
    for (const slug of INACTIVE) {
      const tool = seed(slug)
      expect(tool.affiliate, slug).toMatchObject({
        hasProgram: true,
        status: 'inactive',
      })
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(tool.affiliate.sourceUrl, slug).toMatch(/^https:\/\//)
      expect(new URL(tool.affiliate.sourceUrl ?? '').hostname, slug).toBe(new URL(tool.url).hostname)
      expect(servesAffiliateLink(slug, null), slug).toBe(false)
    }
    for (const slug of SLUGS) {
      if (INACTIVE.includes(slug as (typeof INACTIVE)[number])) continue
      expect(seed(slug).affiliate, slug).toMatchObject({
        hasProgram: false,
        network: null,
        sourceUrl: null,
        status: 'none',
        commissionNote: null,
      })
    }
  })

  it('sends /go for each new tool to that tool’s official URL', async () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const official = new URL(tool.url).origin + '/'
      const head = resolveHeadGoRedirect(slug)
      expect(head, slug).toMatchObject({ status: 302 })
      if (head.status !== 302) continue
      expect(new URL(head.location).origin + new URL(head.location).pathname, slug).toBe(official)
      expect(head.location, slug).not.toMatch(/impact\.com|lemonsqueezy|im_ref|via=|ref=/)

      const get = await resolveGoRedirect({
        headers: new Headers(),
        ip: '203.0.113.50',
        siteUrl: 'https://bestbotfor.com',
        seedUrl: tool.url,
        seedAffiliateUrl: tool.affiliate.affiliateUrl ?? null,
        allowedHosts: tool.allowedHosts,
        limit: async () => ({ ok: true }),
        loadTool: async () => ({ id: 1, url: tool.url, affiliateUrl: null }),
      })
      expect(get.status, slug).toBe(302)
      if (get.status !== 302) continue
      const destination = new URL(get.location)
      expect(destination.origin + destination.pathname, slug).toBe(official)
      expect(destination.hostname, slug).toBe(tool.allowedHosts[0])
      expect(get.location, slug).not.toMatch(/impact\.com|lemonsqueezy|im_ref/)
    }
  })
})
