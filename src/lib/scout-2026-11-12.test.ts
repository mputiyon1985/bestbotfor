import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AffiliateDisclosure } from '@/components/affiliate-disclosure'
import { OutboundLink } from '@/components/outbound-link'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { AFFILIATE_BUTTON_NOTE } from './affiliate-copy'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-12'
const SLUGS = [
  'call-e',
  'scroogefrog',
  'sendr',
  'shot-video',
  'skillbox',
  'stiro',
  'kippy-ai',
  'plurai',
  'three-dev',
  'relay-ai',
  'foxpit',
  'mister-blocks',
  'neura-hq',
  'valin',
] as const
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

describe('bot scout 2026-11-12', () => {
  it('adds 14 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(14)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(14)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(367)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(363)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(255)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.needsVerification, slug).toBeFalsy()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      if (slug === 'sendr') {
        expect(tool.affiliate.affiliateUrl, slug).toBe('https://sendr.cello.so/LOp5fYtd9Jc')
        expect(tool.allowedHosts, slug).toEqual(['www.sendr.ai', 'sendr.cello.so/LOp5fYtd9Jc'])
      } else {
        expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
        expect(tool.allowedHosts, slug).toEqual([new URL(tool.url).hostname])
      }
    }
  })

  it('maps missing scout categories onto existing ones and leaves valid ones unchanged', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(seed('call-e').category).toBe('Voice')
    expect(seed('scroogefrog').category).toBe('Automation')
    expect(seed('sendr').category).toBe('Automation')
    expect(seed('shot-video').category).toBe('Video editing')
    expect(seed('skillbox').category).toBe('Development')
    expect(seed('stiro').category).toBe('Automation')
    expect(seed('kippy-ai').category).toBe('Chat assistant')
    expect(seed('plurai').category).toBe('Development')
    expect(seed('three-dev').category).toBe('Development')
    expect(seed('relay-ai').category).toBe('Productivity')
    expect(seed('foxpit').category).toBe('Coding assistant')
    expect(seed('mister-blocks').category).toBe('Design')
    expect(seed('neura-hq').category).toBe('Automation')
    expect(seed('valin').category).toBe('Productivity')
    for (const slug of SLUGS) {
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Sales', 'Marketing', 'Finance', 'Video', 'Analytics', 'Security'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('call-e')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('call-e'))).toBe('Paid')
    expect(seed('scroogefrog')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 10, hasFreeTier: false })
    expect(priceLabel(seed('scroogefrog'))).toBe('$10 and up')
    expect(seed('sendr')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 119, hasFreeTier: false })
    expect(priceLabel(seed('sendr'))).toBe('$119 and up')
    expect(`${seed('sendr').shortDesc} ${seed('sendr').longDesc}`).not.toMatch(/\$99|\$79/)
    expect(priceLabel(seed('sendr'))).not.toContain('billed annually')
    expect(seed('shot-video')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true })
    expect(priceLabel(seed('shot-video'))).toBe('Free tier, then $19 and up')
    expect(seed('skillbox')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('skillbox'))).toBe('Free tier, paid plans available')
    expect(seed('stiro')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 149, hasFreeTier: true })
    expect(priceLabel(seed('stiro'))).toBe('Free tier, then $149 and up')
    expect(seed('kippy-ai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('kippy-ai'))).toBe('Free tier, paid plans available')
    expect(seed('plurai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 60, hasFreeTier: true })
    expect(priceLabel(seed('plurai'))).toBe('Free tier, then $60 and up')
    expect(seed('three-dev')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 79, hasFreeTier: true })
    expect(priceLabel(seed('three-dev'))).toBe('Free tier, then $79 and up')
    expect(seed('relay-ai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 39, hasFreeTier: true })
    expect(priceLabel(seed('relay-ai'))).toBe('Free tier, then $39 and up')
    expect(priceLabel(seed('relay-ai'))).not.toContain('billed annually')
    expect(seed('foxpit')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 12, hasFreeTier: false })
    expect(priceLabel(seed('foxpit'))).toBe('$12 and up')
    expect(seed('mister-blocks')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('mister-blocks'))).toBe('Free')
    expect(seed('neura-hq')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(priceLabel(seed('neura-hq'))).toBe('$99 and up')
    expect(seed('valin')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('valin'))).toBe('Pricing not published')
    expect(seed('skillbox').longDesc).not.toMatch(/\$\d/)
    expect(seed('valin').longDesc).not.toMatch(/\$\d/)
    expect(seed('kippy-ai').longDesc).toContain('$16.99')
    expect(seed('kippy-ai').longDesc).toContain('$7.99')
    expect(seed('neura-hq').longDesc).toContain('₹6,999')
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('call-e').longDesc).toContain('not a monthly plan')
    expect(seed('call-e').longDesc).toContain('not a free plan')
    expect(seed('call-e').longDesc).toContain('No free plan was found')
    expect(seed('call-e').longDesc).toContain("vendor's public offer")
    expect(seed('scroogefrog').longDesc).toContain('not a free plan')
    expect(seed('scroogefrog').longDesc).toContain('No free plan was found')
    expect(seed('scroogefrog').longDesc).toContain('not the stored from-price')
    expect(seed('scroogefrog').longDesc).toContain("vendor's public offer")
    expect(seed('sendr').longDesc).toContain('not a free plan')
    expect(seed('sendr').longDesc).toContain('No free plan was found')
    expect(seed('sendr').longDesc).toContain('not the stored from-price')
    expect(seed('sendr').longDesc).toContain("vendor's public offer")
    expect(seed('shot-video').longDesc).toContain('free tier')
    expect(seed('shot-video').longDesc).toContain('not the stored from-price')
    expect(seed('shot-video').longDesc).toContain("vendor's public offers")
    expect(seed('skillbox').longDesc).toContain('£0')
    expect(seed('skillbox').longDesc).toContain('not a free plan')
    expect(seed('skillbox').longDesc).toContain('free tier')
    expect(seed('skillbox').longDesc).toContain('no dollar from-price is stored')
    expect(seed('stiro').longDesc).toContain('free tier')
    expect(seed('stiro').longDesc).toContain('not the stored from-price')
    expect(seed('kippy-ai').longDesc).toContain('no monthly from-price is stored')
    expect(seed('kippy-ai').longDesc).toContain('free tier')
    expect(seed('plurai').longDesc).toContain('free tier')
    expect(seed('plurai').longDesc).toContain('not a monthly plan')
    expect(seed('three-dev').longDesc).toContain('not a free plan')
    expect(seed('three-dev').longDesc).toContain('free tier')
    expect(seed('three-dev').longDesc).toContain("vendor's public offer")
    expect(seed('three-dev').longDesc).toContain('early access')
    expect(seed('relay-ai').longDesc).toContain('not the stored from-price')
    expect(seed('relay-ai').longDesc).toContain('not a free plan')
    expect(seed('relay-ai').longDesc).toContain('free tier')
    expect(seed('foxpit').longDesc).toContain('not the stored from-price')
    expect(seed('foxpit').longDesc).toContain('No free plan was found')
    expect(seed('foxpit').longDesc).toContain("vendor's public offer")
    expect(seed('mister-blocks').longDesc).toContain('no paid price is stored')
    expect(seed('neura-hq').longDesc).toContain('not a free plan')
    expect(seed('neura-hq').longDesc).toContain('No free plan was found')
    expect(seed('neura-hq').longDesc).toContain('not a second from-price')
    expect(seed('neura-hq').longDesc).toContain("vendor's public offer")
    expect(seed('valin').longDesc).toContain('No price is published')
    expect(seed('valin').longDesc).toContain('not a free plan')
    expect(seed('valin').longDesc).toContain("vendor's public offer")
  })

  it('activates Sendr’s exact tracking link and leaves the other thirteen off', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(7)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      if (slug === 'sendr') continue
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('sendr').affiliate).toEqual({
      hasProgram: true,
      network: 'Cello',
      sourceUrl: 'https://www.sendr.ai/affiliates#apply-form',
      status: 'active',
      commissionNote:
        '20% of every payment. 30% of every payment for the first 100 founding affiliates, for life, while they stay active by referring 2 paying customers every 6 months. Up to $5,000 per customer. Claimed after a 30-day hold and paid by PayPal.',
      affiliateUrl: 'https://sendr.cello.so/LOp5fYtd9Jc',
    })
    expect(seed('sendr').allowedHosts).toEqual(['www.sendr.ai', 'sendr.cello.so/LOp5fYtd9Jc'])
    expect(seed('sendr').priceFromUsd).toBe(119)
    expect(new URL(seed('sendr').affiliate.sourceUrl!).hostname).toBe('www.sendr.ai')
    expect(servesAffiliateLink('sendr', 'https://sendr.cello.so/LOp5fYtd9Jc', 'active')).toBe(true)
    expect(servesAffiliateLink('sendr', 'https://sendr.cello.so/LOp5fYtd9Jc', 'inactive')).toBe(false)
    expect(servesAffiliateLink('sendr', seed('sendr').affiliate.sourceUrl, 'active')).toBe(false)
    expect(servesAffiliateLink('sendr', 'https://sendr.cello.so/other', 'active')).toBe(false)
    const visit = renderToStaticMarkup(createElement(OutboundLink, { slug: 'sendr', affiliate: true, children: 'Visit Sendr' }))
    expect(visit).toContain('href="/go/sendr"')
    expect(visit).toContain('rel="sponsored nofollow noopener"')
    const note = renderToStaticMarkup(createElement(AffiliateDisclosure, { affiliate: true, vendor: 'Sendr' }))
    expect(note).toContain(AFFILIATE_BUTTON_NOTE)
    expect(note).toContain('Affiliate link')
    for (const slug of SLUGS) {
      if (slug === 'sendr') continue
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-12'))
    expect(scoutBlock.match(/affiliateUrl/g)).toEqual(['affiliateUrl'])
    expect(scoutBlock.match(/status: 'active'/g)).toEqual(["status: 'active'"])
    expect(scoutBlock).toContain('https://sendr.cello.so/LOp5fYtd9Jc')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
  })

  it('sends /go/sendr to the exact Cello link and HEAD to the official site', async () => {
    const tool = seed('sendr')
    const tracking = 'https://sendr.cello.so/LOp5fYtd9Jc'
    expect(resolveHeadGoRedirect('sendr')).toMatchObject({ status: 302, location: 'https://www.sendr.ai/' })
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
      location: tracking,
      click: { affiliate: true, programId: 1, subIdParam: null },
    })
    if (get.status === 302) expect(new URL(get.location).search).toBe('')
  })

  it('sends /go for each new tool to that tool’s official URL with the standard UTM', async () => {
    for (const slug of SLUGS) {
      if (slug === 'sendr') continue
      const tool = seed(slug)
      const official = new URL(tool.url)
      const officialPath = `${official.origin}${official.pathname}`
      const head = resolveHeadGoRedirect(slug)
      expect(head, slug).toMatchObject({ status: 302 })
      if (head.status !== 302) continue
      expect(`${new URL(head.location).origin}${new URL(head.location).pathname}`, slug).toBe(officialPath)
      expect(new URL(head.location).search, slug).toBe('')
      expect(head.location, slug).not.toMatch(/affiliate|rewardful|camp_id|cello|endorsely|im_ref|via=|ref=|creators|sponsored/)

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
      expect(destination.searchParams.get('utm_source'), slug).toBe('bestbotfor')
      expect(destination.searchParams.get('utm_medium'), slug).toBe('referral')
      expect(destination.searchParams.get('utm_campaign'), slug).toBe('direct')
      expect([...destination.searchParams.keys()].sort(), slug).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
      expect(get.location, slug).not.toMatch(/rewardful|camp_id|cello|endorsely|im_ref|via=|ref=|creators|sponsored/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
