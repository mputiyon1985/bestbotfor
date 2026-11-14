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

const SCOUT = '2026-11-09'
const TRACKING = 'https://docsalot.dev/?utm-source=bestbotfor'

function seed(slug: string) {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('bot scout 2026-11-09', () => {
  it('adds unrated DocsAlot in Writing, with an empty fit list and a monogram host', () => {
    const tool = seed('docsalot')
    expect(toolSeeds.filter((item) => item.slug === 'docsalot')).toHaveLength(1)
    expect(tool).toMatchObject({
      addedAt: SCOUT,
      lastVerifiedAt: SCOUT,
      name: 'DocsAlot',
      vendor: 'DocsAlot',
      url: 'https://docsalot.dev',
      category: 'Writing',
      pricingModel: 'paid',
      priceFromUsd: 79,
      hasFreeTier: false,
      fits: [],
    })
    expect(tool.unlisted).toBeFalsy()
    expect(tool.needsVerification).toBeFalsy()
    expect(tool.url.includes('?')).toBe(false)
    expect(priceLabel(tool)).toBe('$79 and up')
    expect(tool.longDesc).toContain('No free plan was found')
    expect(tool.longDesc).toContain('not the stored from-price')
    expect(`${tool.shortDesc} ${tool.longDesc}`).not.toMatch(/PH50|BestBotFor code|reader deal/i)
    const categories = new Set(toolSeeds.filter((item) => item.slug !== 'docsalot').map((item) => item.category))
    expect(categories.has('Writing')).toBe(true)
  })

  it('activates DocsAlot’s exact tracking link and leaves Dageno, Databox, and crystl off', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toContain('docsalot')
    for (const slug of ['dageno-ai', 'databox', 'crystl'] as const) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(seed(slug).affiliate.status, slug).toBe('inactive')
      expect(seed(slug).affiliate.affiliateUrl, slug).toBeUndefined()
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    const sendr = toolSeeds.find((tool) => tool.slug === 'sendr')
    expect(sendr?.affiliate.status).toBe('active')
    expect(sendr?.affiliate.affiliateUrl).toBe('https://sendr.cello.so/LOp5fYtd9Jc')
    expect(servesAffiliateLink('sendr', sendr?.affiliate.affiliateUrl, 'active')).toBe(true)
    expect(servesAffiliateLink('sendr', sendr?.affiliate.sourceUrl, 'inactive')).toBe(false)

    const tool = seed('docsalot')
    expect(tool.affiliate).toEqual({
      hasProgram: true,
      network: null,
      sourceUrl: 'https://docs.docsalot.dev/partners/affiliates',
      status: 'active',
      commissionNote: '50% for the life of the customer, across all plans, as stated on the affiliates page.',
      affiliateUrl: TRACKING,
    })
    expect(tool.allowedHosts).toEqual([
      'docsalot.dev',
      'docsalot.dev/?utm-source=bestbotfor',
      'buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08',
      'buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07',
    ])
    expect(servesAffiliateLink('docsalot', TRACKING, 'active')).toBe(true)
    expect(servesAffiliateLink('docsalot', TRACKING, 'inactive')).toBe(false)

    const visit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'docsalot', affiliate: true, children: 'Visit DocsAlot' }))
    expect(visit).toContain('href="/go/docsalot"')
    expect(visit).toContain('rel="sponsored nofollow noopener"')
    const note = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'DocsAlot' }))
    expect(note).toContain(AFFILIATE_BUTTON_NOTE)
    expect(note).toContain('Affiliate link')
  })

  it('sends /go/docsalot to the exact tracking URL and HEAD to the official site', async () => {
    const tool = seed('docsalot')
    expect(resolveHeadGoRedirect('docsalot')).toMatchObject({ status: 302, location: 'https://docsalot.dev/' })

    const get = await resolveGoRedirect({
      headers: new Headers(),
      ip: '203.0.113.57',
      siteUrl: 'https://bestbotfor.com',
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
    expect(get).toMatchObject({
      status: 302,
      location: TRACKING,
      click: { affiliate: true, programId: 1, subIdParam: null },
    })
  })
})
