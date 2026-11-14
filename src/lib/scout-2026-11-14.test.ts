import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-14'
const SLUGS = [
  'caveman-code',
  'antelog',
  'snapdub',
  'hiringnow',
  'exmergo-dex',
  'trainn',
  'gatrends',
  'gamma-pdf',
  'holp',
  'adflame',
  'problembot',
  'aven-app-agent',
  'thrive',
  'miingl-social',
  'talkify',
  'anvil',
] as const
const PROGRAMS = ['snapdub', 'exmergo-dex', 'trainn', 'adflame', 'thrive'] as const
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

describe('bot scout 2026-11-14', () => {
  it('adds 16 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(16)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(16)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(398)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(394)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(286)
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
      expect(unratedSlugs, slug).toContain(slug)
    }
    expect(seed('caveman-code').name).toBe('Caveman Code')
    expect(seed('exmergo-dex').name).toBe('Dex Semantics (Exmergo Dex)')
    expect(seed('exmergo-dex').vendor).toBe('Exmergo')
    expect(seed('adflame').name).toBe('AdFlame.ai')
    expect(seed('miingl-social').name).toBe('miingl social')
    expect(seed('problembot').name).toBe('Problembot')
    expect(seed('problembot').vendor).toBe('Problembo')
    expect(seed('problembot').url).toBe('https://bot.problembo.com/features')
    expect(seed('problembot').allowedHosts).toEqual(['bot.problembo.com'])
    expect(seed('gamma-pdf').url).toBe('https://gammapdf.com')
    expect(seed('gamma-pdf').longDesc).not.toContain('gamma.app')
    expect(seed('gamma-pdf').shortDesc).not.toContain('gamma.app')
    expect(seed('gamma').url).toBe('https://gamma.app')
    expect(seed('gamma').slug).not.toBe('gamma-pdf')
    expect(seed('anvil').url).toBe('https://tryanvil.dev/')
    expect(seed('exmergo-dex').platforms).toEqual([])
    expect(seed('talkify').platforms).toEqual([])
    expect(seed('aven-app-agent').platforms).toEqual(['Web', 'Android'])
    expect(seed('gamma-pdf').platforms).toEqual(['Web', 'macOS', 'Windows', 'iOS', 'Self-hosted'])
  })

  it('keeps scout categories that already exist, including the four that have no Marketing or Finance category', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(seed('caveman-code').category).toBe('Coding assistant')
    expect(seed('antelog').category).toBe('Development')
    expect(seed('snapdub').category).toBe('Video editing')
    expect(seed('hiringnow').category).toBe('Productivity')
    expect(seed('exmergo-dex').category).toBe('Development')
    expect(seed('trainn').category).toBe('AI video')
    expect(seed('gatrends').category).toBe('Research')
    expect(seed('gamma-pdf').category).toBe('Research')
    expect(seed('holp').category).toBe('Chat assistant')
    expect(seed('adflame').category).toBe('Research')
    expect(seed('problembot').category).toBe('Automation')
    expect(seed('aven-app-agent').category).toBe('Development')
    expect(seed('thrive').category).toBe('Research')
    expect(seed('miingl-social').category).toBe('Automation')
    expect(seed('talkify').category).toBe('Writing')
    expect(seed('anvil').category).toBe('Site builder')
    for (const slug of SLUGS) {
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Marketing', 'Finance', 'Sales'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('caveman-code')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true })
    expect(priceLabel(seed('caveman-code'))).toBe('Free tier, then $20 and up')
    expect(priceLabel(seed('caveman-code'))).not.toContain('billed annually')
    expect(seed('antelog')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('antelog'))).toBe('Free tier, paid plans available')
    expect(seed('snapdub')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('snapdub'))).toBe('Free tier, paid plans available')
    expect(seed('hiringnow')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true })
    expect(priceLabel(seed('hiringnow'))).toBe('Free tier, then $29 and up')
    expect(seed('exmergo-dex')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('exmergo-dex'))).toBe('Free')
    expect(seed('trainn')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false })
    expect(priceLabel(seed('trainn'))).toBe('$19 and up')
    expect(priceLabel(seed('trainn'))).not.toContain('billed annually')
    expect(seed('gatrends')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 12, hasFreeTier: true })
    expect(priceLabel(seed('gatrends'))).toBe('Free tier, then $12 and up')
    expect(seed('gamma-pdf')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 2, hasFreeTier: true })
    expect(priceLabel(seed('gamma-pdf'))).toBe('Free tier, then $2 and up')
    expect(seed('holp')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('holp'))).toBe('Paid')
    expect(seed('adflame')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 199, hasFreeTier: false })
    expect(priceLabel(seed('adflame'))).toBe('$199 and up')
    expect(priceLabel(seed('adflame'))).not.toContain('billed annually')
    expect(seed('problembot')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('problembot'))).toBe('Paid')
    expect(seed('aven-app-agent')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 174, hasFreeTier: false })
    expect(priceLabel(seed('aven-app-agent'))).toBe('$174 and up')
    expect(priceLabel(seed('aven-app-agent'))).not.toContain('billed annually')
    expect(seed('thrive')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false })
    expect(priceLabel(seed('thrive'))).toBe('$99 and up')
    expect(seed('miingl-social')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('miingl-social'))).toBe('Free tier, paid plans available')
    expect(seed('talkify')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('talkify'))).toBe('$32 a year')
    expect(priceLabel(seed('talkify'))).not.toContain('/mo')
    expect(priceLabel(seed('talkify'))).not.toContain('billed annually')
    expect(seed('anvil')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('anvil'))).toBe('Paid')
    expect(seed('snapdub').longDesc).not.toMatch(/\$\d/)
    expect(seed('holp').longDesc).toContain('£25')
    expect(seed('holp').longDesc).toContain('$35')
    expect(seed('holp').priceFromUsd).toBeNull()
    expect(seed('anvil').longDesc).toContain('Zambian kwacha')
    expect(seed('anvil').longDesc).toContain('K60')
    expect(seed('anvil').longDesc).toContain('$3')
    expect(seed('anvil').priceFromUsd).toBeNull()
    expect(seed('talkify').longDesc).toContain('$32 a year')
    expect(seed('problembot').longDesc).toContain('$0.60')
    expect(seed('problembot').priceFromUsd).toBeNull()
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('caveman-code').longDesc).toContain('free tier')
    expect(seed('caveman-code').longDesc).toContain('not the stored from-price')
    expect(seed('caveman-code').longDesc).toContain("vendor's public offer")
    expect(seed('caveman-code').longDesc).toContain('not a free plan')
    expect(seed('antelog').longDesc).toContain('free tier')
    expect(seed('antelog').longDesc).toContain('not published')
    expect(seed('antelog').longDesc).toContain("vendor's public offer")
    expect(seed('snapdub').longDesc).toContain('€0')
    expect(seed('snapdub').longDesc).toContain('free tier')
    expect(seed('snapdub').longDesc).toContain('no dollar from-price is stored')
    expect(seed('snapdub').longDesc).toContain("vendor's public offer")
    expect(seed('hiringnow').longDesc).toContain('free tier')
    expect(seed('hiringnow').longDesc).toContain('not the stored from-price')
    expect(seed('hiringnow').longDesc).toContain("vendor's public offer")
    expect(seed('exmergo-dex').longDesc).toContain('not published')
    expect(seed('exmergo-dex').longDesc).not.toMatch(/scout|catalog|stored/)
    expect(seed('trainn').longDesc).toContain('not the stored from-price')
    expect(seed('trainn').longDesc).toContain('not a free plan')
    expect(seed('trainn').longDesc).toContain('No free plan was found')
    expect(seed('trainn').longDesc).toContain("vendor's public offer")
    expect(seed('gatrends').longDesc).toContain('free tier')
    expect(seed('gatrends').longDesc).toContain('not the stored from-price')
    expect(seed('gatrends').longDesc).toContain("vendor's public offer")
    expect(seed('gamma-pdf').longDesc).toContain('free tier')
    expect(seed('gamma-pdf').longDesc).toContain('not the stored from-price')
    expect(seed('gamma-pdf').longDesc).toContain('gammapdf.com')
    expect(seed('holp').longDesc).toContain('no dollar from-price')
    expect(seed('holp').longDesc).toContain('not a free plan')
    expect(seed('holp').longDesc).toContain('No free plan was found')
    expect(seed('holp').longDesc).toContain("vendor's public offer")
    expect(seed('adflame').longDesc).toContain('not the stored from-price')
    expect(seed('adflame').longDesc).toContain('not a free plan')
    expect(seed('adflame').longDesc).toContain('No free plan was found')
    expect(seed('adflame').longDesc).toContain("vendor's public offer")
    expect(seed('problembot').longDesc).toContain('not a monthly plan')
    expect(seed('problembot').longDesc).toContain('not a free plan')
    expect(seed('problembot').longDesc).toContain('No free plan was found')
    expect(seed('problembot').longDesc).toContain("vendor's public offer")
    expect(seed('aven-app-agent').longDesc).toContain('not the stored from-price')
    expect(seed('aven-app-agent').longDesc).toContain('not a free plan')
    expect(seed('aven-app-agent').longDesc).toContain('No free plan was found')
    expect(seed('aven-app-agent').longDesc).toContain("vendor's public offer")
    expect(seed('thrive').longDesc).toContain('not the stored from-price')
    expect(seed('thrive').longDesc).toContain('not a free plan')
    expect(seed('thrive').longDesc).toContain('No free plan was found')
    expect(seed('thrive').longDesc).toContain("vendor's public offer")
    expect(seed('thrive').longDesc).not.toContain('Founding Partner')
    expect(seed('miingl-social').longDesc).toContain('free tier')
    expect(seed('miingl-social').longDesc).toContain('not published')
    expect(seed('miingl-social').longDesc).toContain("vendor's public offer")
    expect(seed('talkify').longDesc).toContain('not a monthly from-price')
    expect(seed('talkify').longDesc).toContain('No free plan was found')
    expect(seed('anvil').longDesc).toContain('no dollar from-price is stored')
    expect(seed('anvil').longDesc).toContain('not a free plan')
    expect(seed('anvil').longDesc).toContain('No free plan was found')
    expect(seed('anvil').longDesc).toContain("vendor's public offer")
  })

  it('seeds only SnapDub, Dex, Trainn, AdFlame and Thrive as inactive programs, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(10)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('snapdub').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house',
      sourceUrl: 'https://snapdub.ai/affiliate',
      status: 'inactive',
      commissionNote:
        '30% of every payment a referred customer makes for their first 12 months. 90-day click window. Paid monthly via PayPal or Wise once over €25, after a 30-day refund window. No cap. Recurring for 12 months. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('exmergo-dex').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house partner program (Referral, Agency, Value-Added Reseller)',
      sourceUrl: 'https://trydex.ai/partners',
      status: 'inactive',
      commissionNote:
        'Referral rewards are agreed with the Exmergo team, for Dex Enterprise. The rate is not stated. Recurring is unknown. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('trainn').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house referral program (in-app link)',
      sourceUrl: 'https://trainn.co/referral-program/',
      status: 'inactive',
      commissionNote:
        "50% of each referred customer's monthly subscription every month, up to $150 per referral. Paid via PayPal or Venmo. The link never expires. Recurring until the $150 cap. Not applied or accepted. No tracking link stored.",
    })
    expect(seed('adflame').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house partner program',
      sourceUrl: 'https://adflame.ai/partners',
      status: 'inactive',
      commissionNote:
        '20% of every payment for 12 months per referred customer. Referred customers get 20% off for 3 months. Recurring for 12 months. Not applied or accepted. No tracking link stored.',
    })
    expect(seed('thrive').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (active Pro members only)',
      sourceUrl: 'https://thrive.fi/affiliates',
      status: 'inactive',
      commissionNote:
        '15% of each paid charge, including subscriptions and credit packs, up to 12 commissions. 30-day cookie. Recurring for 12 months. Active Pro members only. Not applied or accepted. No tracking link stored.',
    })
    for (const slug of PROGRAMS) {
      const tool = seed(slug)
      expect(new URL(tool.affiliate.sourceUrl!).hostname, slug).toBe(tool.allowedHosts[0])
      expect(servesAffiliateLink(slug, null, tool.affiliate.status), slug).toBe(false)
      expect(servesAffiliateLink(slug, tool.affiliate.sourceUrl, 'inactive'), slug).toBe(false)
      expect(servesAffiliateLink(slug, `${tool.url}/?ref=bestbotfor`, 'inactive'), slug).toBe(false)
    }
    for (const slug of SLUGS) {
      if (PROGRAMS.includes(slug as (typeof PROGRAMS)[number])) continue
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-14'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
    expect(scoutBlock).toContain("SCOUTED_2026_11_14")
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
