import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-13'
const SLUGS = [
  'yogurt',
  'spacefast',
  'youart',
  'offstage-cloud',
  'harnessrouter',
  'omnigraph',
  'letter-command-l',
  'insight7-voice-agents',
  'agentteams',
  'render-sandboxes',
  'wizardnote',
  'nameshot',
  'burnstate',
  'willo',
  'qorqbot',
] as const
const PROGRAMS = ['youart', 'insight7-voice-agents', 'willo'] as const
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

describe('bot scout 2026-11-13', () => {
  it('adds 15 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(15)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(15)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(382)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(378)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(270)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.needsVerification, slug).toBeFalsy()
      expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      expect(tool.allowedHosts, slug).toEqual([new URL(tool.url).hostname])
    }
    expect(seed('letter-command-l').name).toBe('⌘+L by Letter')
    expect(seed('spacefast').name).toBe('Spacefast by Automattic')
    expect(seed('wizardnote').platforms).toEqual([])
    expect(toolSeeds.some((tool) => tool.platforms.includes('Phone'))).toBe(false)
  })

  it('keeps scout categories that already exist in the catalog', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(seed('yogurt').category).toBe('Meetings')
    expect(seed('spacefast').category).toBe('Development')
    expect(seed('youart').category).toBe('AI video')
    expect(seed('offstage-cloud').category).toBe('Development')
    expect(seed('harnessrouter').category).toBe('Agent builder')
    expect(seed('omnigraph').category).toBe('Development')
    expect(seed('letter-command-l').category).toBe('Coding assistant')
    expect(seed('insight7-voice-agents').category).toBe('Voice')
    expect(seed('agentteams').category).toBe('Agent builder')
    expect(seed('render-sandboxes').category).toBe('Development')
    expect(seed('wizardnote').category).toBe('Productivity')
    expect(seed('nameshot').category).toBe('Productivity')
    expect(seed('burnstate').category).toBe('Development')
    expect(seed('willo').category).toBe('Chat assistant')
    expect(seed('qorqbot').category).toBe('Automation')
    for (const slug of SLUGS) expect(existing.has(seed(slug).category), slug).toBe(true)
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('yogurt')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('yogurt'))).toBe('Free')
    expect(seed('spacefast')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true })
    expect(priceLabel(seed('spacefast'))).toBe('Free tier, then $5 and up')
    expect(seed('youart')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 7.99, hasFreeTier: true })
    expect(priceLabel(seed('youart'))).toBe('Free tier, then $7.99/mo and up, billed annually')
    expect(seed('offstage-cloud')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('offstage-cloud'))).toBe('$1.10 per hour')
    expect(seed('harnessrouter')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true })
    expect(priceLabel(seed('harnessrouter'))).toBe('Free tier, then $20 and up')
    expect(seed('omnigraph')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('omnigraph'))).toBe('Free')
    expect(seed('letter-command-l')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false })
    expect(priceLabel(seed('letter-command-l'))).toBe('$25 and up')
    expect(seed('insight7-voice-agents')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('insight7-voice-agents'))).toBe('Pricing not published')
    expect(seed('agentteams')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true })
    expect(priceLabel(seed('agentteams'))).toBe('Free tier, then $29 and up')
    expect(seed('render-sandboxes')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('render-sandboxes'))).toBe('Pricing not published')
    expect(seed('wizardnote')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('wizardnote'))).toBe('Free tier, paid plans available')
    expect(seed('nameshot')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 4.99, hasFreeTier: false })
    expect(priceLabel(seed('nameshot'))).toBe('$4.99 and up')
    expect(seed('burnstate')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 3.99, hasFreeTier: false })
    expect(priceLabel(seed('burnstate'))).toBe('$3.99 and up')
    expect(seed('willo')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('willo'))).toBe('Free to start; paid plans not open yet')
    expect(seed('qorqbot')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('qorqbot'))).toBe('Free; commercial license $10/mo billed annually from 2027')
    expect(seed('wizardnote').longDesc).not.toMatch(/\$\d/)
    expect(seed('omnigraph').longDesc).not.toMatch(/\$\d/)
    expect(seed('insight7-voice-agents').longDesc).toContain('$99')
    expect(seed('insight7-voice-agents').priceFromUsd).toBeNull()
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('yogurt').longDesc).toContain('No paid plan was found')
    expect(seed('spacefast').longDesc).toContain('free tier')
    expect(seed('spacefast').longDesc).toContain('not the stored from-price')
    expect(seed('youart').longDesc).toContain('free tier')
    expect(seed('youart').longDesc).toContain('billed annually')
    expect(seed('youart').longDesc).toContain('not the stored from-price')
    expect(seed('youart').longDesc).toContain("vendor's public pricing")
    expect(seed('offstage-cloud').longDesc).toContain('not a monthly plan')
    expect(seed('offstage-cloud').longDesc).toContain('not a free plan')
    expect(seed('offstage-cloud').longDesc).toContain('No free plan was found')
    expect(seed('offstage-cloud').longDesc).toContain("vendor's public offer")
    expect(seed('harnessrouter').longDesc).toContain('free tier')
    expect(seed('harnessrouter').longDesc).toContain('not a free plan')
    expect(seed('harnessrouter').longDesc).toContain("vendor's public offer")
    expect(seed('omnigraph').longDesc).toContain('no published price')
    expect(seed('omnigraph').longDesc).not.toMatch(/scout|catalog|stored/)
    expect(seed('letter-command-l').longDesc).toContain('not a free plan')
    expect(seed('letter-command-l').longDesc).toContain('No free plan was found')
    expect(seed('letter-command-l').longDesc).toContain('not the stored from-price')
    expect(seed('letter-command-l').longDesc).toContain("vendor's public offer")
    expect(seed('insight7-voice-agents').longDesc).toContain('No free plan was found')
    expect(seed('insight7-voice-agents').longDesc).toContain('not the voice-agent from-price')
    expect(seed('insight7-voice-agents').longDesc).toContain("vendor's public offer")
    expect(seed('agentteams').longDesc).toContain('free tier')
    expect(seed('agentteams').longDesc).toContain('not the stored from-price')
    expect(seed('agentteams').longDesc).toContain('not a free plan')
    expect(seed('agentteams').longDesc).toContain("vendor's public offer")
    expect(seed('render-sandboxes').longDesc).toContain('not the stored from-price')
    expect(seed('render-sandboxes').longDesc).toContain('not a free plan')
    expect(seed('render-sandboxes').longDesc).toContain("vendor's public offer")
    expect(seed('wizardnote').longDesc).toContain('€0')
    expect(seed('wizardnote').longDesc).toContain('not shown on the site')
    expect(seed('wizardnote').longDesc).not.toMatch(/scout|catalog|stored|Phone/)
    expect(seed('nameshot').longDesc).toContain('$4.99 once at launch')
    expect(seed('nameshot').longDesc).toContain('7-day trial')
    expect(seed('nameshot').longDesc).not.toMatch(/scout|catalog|stored|sponsorship/)
    expect(seed('burnstate').longDesc).toContain('not the stored from-price')
    expect(seed('burnstate').longDesc).toContain('No free plan was found')
    expect(seed('willo').longDesc).toContain('free tier')
    expect(seed('willo').longDesc).toContain('not open yet')
    expect(seed('willo').longDesc).toContain('no paid price is stored')
    expect(seed('willo').longDesc).toContain('not a free plan')
    expect(seed('willo').longDesc).toContain("vendor's public offer")
    expect(seed('qorqbot').longDesc).toContain('free tier')
    expect(seed('qorqbot').longDesc).toContain('not the stored from-price')
    expect(seed('qorqbot').longDesc).toContain("vendor's public offer")
  })

  it('seeds only YouArt, Insight7 and Willo as inactive programs, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(7)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('youart').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (YouArt affiliate dashboard)',
      sourceUrl: 'https://youart.ai/affiliate',
      status: 'inactive',
      commissionNote:
        '30% of referred payments on monthly or annual plans, with a 90-day cookie. Recurring is unknown. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('insight7-voice-agents').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house partner program',
      sourceUrl: 'https://insight7.io/partners-registration/',
      status: 'inactive',
      commissionNote:
        'Referral Partner: 25% of every sourced deal. Managed Partner: lifetime commissions, rate not stated. Recurring is unknown, except that lifetime commissions are stated only for Managed Partners. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('willo').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (Creator ambassador program)',
      sourceUrl: 'https://willocompanion.com/ambassador',
      status: 'inactive',
      commissionNote:
        "60% of each subscriber's first month only, not recurring. Payout is 30 days after payment, with a $10 minimum. Creators who post 4 pieces per 30 days get the Legend plan free while they do. Not applied or accepted. No tracking link stored.",
    })
    expect(seed('youart').allowedHosts).toEqual(['youart.ai'])
    expect(seed('insight7-voice-agents').allowedHosts).toEqual(['insight7.io'])
    expect(seed('willo').allowedHosts).toEqual(['willocompanion.com'])
    expect(new URL(seed('youart').affiliate.sourceUrl!).hostname).toBe('youart.ai')
    expect(new URL(seed('insight7-voice-agents').affiliate.sourceUrl!).hostname).toBe('insight7.io')
    expect(new URL(seed('willo').affiliate.sourceUrl!).hostname).toBe('willocompanion.com')
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
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-13'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
  })

  it('sends /go for each new tool to that tool’s official URL, with no affiliate link', async () => {
    for (const slug of SLUGS) {
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
