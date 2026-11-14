import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AffiliateDisclosure } from '@/components/affiliate-disclosure'
import { OutboundLink } from '@/components/outbound-link'
import { toolSeeds } from '@/data/catalog'
import { APPROVED_ACTIVE_AFFILIATES } from './affiliate-admin'
import { AFFILIATE_BUTTON_NOTE } from './affiliate-copy'
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
    expect(toolSeeds).toHaveLength(382)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      const host = new URL(tool.url).hostname
      if (slug === 'context-dev') {
        expect(tool.affiliate.affiliateUrl, slug).toBe('https://link.context.dev/mark-putiyon')
        expect(tool.allowedHosts, slug).toEqual(['context.dev', 'link.context.dev/mark-putiyon'])
      } else {
        expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
        expect(tool.allowedHosts, slug).toEqual([host])
      }
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

  it('activates Context.dev’s exact tracking link and leaves Videco inactive', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev'])
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
    const context = seed('context-dev')
    expect(context.affiliate).toEqual({
      hasProgram: true,
      network: null,
      sourceUrl: null,
      status: 'active',
      commissionNote: null,
      affiliateUrl: 'https://link.context.dev/mark-putiyon',
    })
    expect(context.allowedHosts).toEqual(['context.dev', 'link.context.dev/mark-putiyon'])
    expect(servesAffiliateLink('context-dev', 'https://link.context.dev/mark-putiyon', 'active')).toBe(true)
    expect(servesAffiliateLink('context-dev', 'https://link.context.dev/mark-putiyon', 'inactive')).toBe(false)
    expect(servesAffiliateLink('context-dev', 'https://link.context.dev/other', 'active')).toBe(false)
    const visit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'context-dev', affiliate: true, children: 'Visit Context.dev' }))
    expect(visit).toContain('href="/go/context-dev"')
    expect(visit).toContain('rel="sponsored nofollow noopener"')
    const note = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'Context.dev' }))
    expect(note).toContain(AFFILIATE_BUTTON_NOTE)
    expect(note).toContain('Affiliate link')
    for (const slug of SLUGS) {
      if (slug === 'videco' || slug === 'context-dev') continue
      expect(seed(slug).affiliate, slug).toEqual({
        hasProgram: false,
        network: null,
        sourceUrl: null,
        status: 'none',
        commissionNote: null,
      })
    }
    for (const slug of ['elevenlabs', 'synthesia', 'context-dev'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
  })

  it('sends /go/context-dev to the exact tracking link and drops any inbound query', async () => {
    const tool = seed('context-dev')
    const tracking = 'https://link.context.dev/mark-putiyon'
    expect(resolveHeadGoRedirect('context-dev')).toMatchObject({ status: 302, location: 'https://context.dev/' })
    for (const search of ['', '?utm_source=x', '?utm_source=x&utm_medium=email&foo=1', '?ref=other']) {
      const get = await resolveGoRedirect({
        headers: new Headers(),
        ip: '203.0.113.50',
        siteUrl: 'https://bestbotfor.com',
        search,
        seedUrl: tool.url,
        seedAffiliateUrl: tool.affiliate.affiliateUrl ?? null,
        seedAffiliateStatus: tool.affiliate.status,
        seedNetwork: tool.affiliate.network,
        allowedHosts: tool.allowedHosts,
        limit: async () => ({ ok: true }),
        loadTool: async () => ({
          id: 1,
          url: tool.url,
          affiliateUrl: tool.affiliate.affiliateUrl ?? null,
          affiliateStatus: tool.affiliate.status,
          network: tool.affiliate.network,
        }),
      })
      expect(get, search).toMatchObject({
        status: 302,
        location: tracking,
        click: { affiliate: true, programId: 1, subIdParam: null },
      })
    }
  })

  it('sends /go for each new tool to that tool’s official URL', async () => {
    for (const slug of SLUGS) {
      if (slug === 'context-dev') continue
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
