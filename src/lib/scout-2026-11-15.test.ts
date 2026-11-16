import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-15'
const SLUGS = [
  'talyn',
  'rakazo',
  'enzo',
  'tesseract-eightcell',
  'cobrain',
  'tulvo',
  'sendhour',
  'geohats',
  'tacie',
  'spark-site',
  'corply',
  'akked',
  'replay-mac',
  'mindwiki',
  'makethemcode',
  'cuedis',
  'shotoku',
  'get-shouting',
  'leda',
  'vb-notes',
  'olbrain-alchemist',
  'constor',
  'dori',
] as const
const PROGRAMS = ['akked'] as const
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

describe('bot scout 2026-11-15', () => {
  it('adds 23 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(23)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(23)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(463)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(459)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(351)
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
    expect(seed('tesseract-eightcell').name).toBe('Tesseract (Eightcell Labs)')
    expect(seed('tesseract-eightcell').vendor).toBe('Eightcell Labs')
    expect(seed('tesseract-eightcell').url).toBe('https://tesseract.dev')
    expect(seed('spark-site').name).toBe('Spark')
    expect(seed('spark-site').url).toBe('https://spark.site')
    expect(seed('replay-mac').name).toBe('Replay')
    expect(seed('replay-mac').url).toBe('https://tryreplay.online')
    expect(seed('rakazo').vendor).toBe('Inbox Zero Inc')
    expect(seed('leda').name).toBe('Leda (da.care)')
    expect(seed('leda').vendor).toBe('da.care')
    expect(seed('leda').url).toBe('https://www.da.care/leda')
    expect(seed('olbrain-alchemist').name).toBe('Alchemist by Olbrain')
    expect(seed('olbrain-alchemist').vendor).toBe('Olbrain')
    expect(seed('olbrain-alchemist').url).toBe('https://olbrain.com/developers/')
    expect(seed('olbrain-alchemist').allowedHosts).toEqual(['olbrain.com'])
    expect(toolSeeds.some((tool) => tool.slug === 'tesseract' || tool.slug === 'spark' || tool.slug === 'replay')).toBe(false)
    expect(seed('shotoku').platforms).toEqual(['Terminal'])
    expect(seed('leda').platforms).toEqual([])
    expect(seed('constor').platforms).toEqual([])
    expect(seed('dori').platforms).toEqual([])
    expect(seed('vb-notes').platforms).toEqual(['macOS', 'Windows', 'Linux', 'iOS', 'Android'])
    expect(seed('tesseract-eightcell').platforms).toEqual(['macOS', 'Windows', 'Linux'])
    expect(seed('rakazo').platforms).toEqual(['Web', 'Self-hosted'])
    expect(seed('cuedis').platforms).toEqual(['Windows', 'macOS'])
  })

  it('keeps scout categories that already exist, including the five that have no Marketing, Legal or Construction category', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    expect(seed('talyn').category).toBe('Coding assistant')
    expect(seed('rakazo').category).toBe('Agent builder')
    expect(seed('enzo').category).toBe('Meetings')
    expect(seed('tesseract-eightcell').category).toBe('Productivity')
    expect(seed('cobrain').category).toBe('Productivity')
    expect(seed('tulvo').category).toBe('Productivity')
    expect(seed('sendhour').category).toBe('Automation')
    expect(seed('geohats').category).toBe('SEO')
    expect(seed('tacie').category).toBe('Meetings')
    expect(seed('spark-site').category).toBe('Vibe coding')
    expect(seed('corply').category).toBe('Automation')
    expect(seed('akked').category).toBe('Automation')
    expect(seed('replay-mac').category).toBe('Meetings')
    expect(seed('mindwiki').category).toBe('Productivity')
    expect(seed('makethemcode').category).toBe('Vibe coding')
    expect(seed('cuedis').category).toBe('Research')
    expect(seed('shotoku').category).toBe('Development')
    expect(seed('get-shouting').category).toBe('Automation')
    expect(seed('leda').category).toBe('Chat assistant')
    expect(seed('vb-notes').category).toBe('Productivity')
    expect(seed('olbrain-alchemist').category).toBe('Agent builder')
    expect(seed('constor').category).toBe('Productivity')
    expect(seed('dori').category).toBe('Research')
    for (const slug of SLUGS) {
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Marketing', 'Legal', 'Construction'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    expect(seed('talyn')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 40, hasFreeTier: true })
    expect(priceLabel(seed('talyn'))).toBe('Free tier, then $40 and up')
    expect(priceLabel(seed('talyn'))).not.toContain('billed annually')
    expect(seed('rakazo')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true })
    expect(priceLabel(seed('rakazo'))).toBe('Free tier, then $15 and up')
    expect(priceLabel(seed('rakazo'))).not.toContain('billed annually')
    expect(seed('enzo')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true })
    expect(priceLabel(seed('enzo'))).toBe('Free tier, then $10 and up')
    expect(seed('tesseract-eightcell')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('tesseract-eightcell'))).toBe('Free tier; top-ups from $10')
    expect(seed('cobrain')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 9, hasFreeTier: true })
    expect(priceLabel(seed('cobrain'))).toBe('Free tier, then $9 and up')
    expect(seed('tulvo')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true })
    expect(priceLabel(seed('tulvo'))).toBe('Free tier, then $15 and up')
    expect(priceLabel(seed('tulvo'))).not.toContain('billed annually')
    expect(seed('sendhour')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false })
    expect(priceLabel(seed('sendhour'))).toBe('$29 and up')
    expect(priceLabel(seed('sendhour'))).not.toContain('billed annually')
    expect(seed('geohats')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 47, hasFreeTier: false })
    expect(priceLabel(seed('geohats'))).toBe('$47 and up')
    expect(seed('tacie')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('tacie'))).toBe('Free during beta; subscription price not published')
    expect(seed('spark-site')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 25, hasFreeTier: true })
    expect(priceLabel(seed('spark-site'))).toBe('Free tier, then $25 and up')
    expect(seed('corply')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 35, hasFreeTier: false })
    expect(priceLabel(seed('corply'))).toBe('$35 and up')
    expect(priceLabel(seed('corply'))).not.toContain('billed annually')
    expect(seed('akked')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 19.99, hasFreeTier: true })
    expect(priceLabel(seed('akked'))).toBe('Free tier, then $19.99 and up')
    expect(priceLabel(seed('akked'))).not.toContain('billed annually')
    expect(seed('replay-mac')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 10, hasFreeTier: false })
    expect(priceLabel(seed('replay-mac'))).toBe('$10 and up')
    expect(seed('mindwiki')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('mindwiki'))).toBe('Free tier, then $200 a year')
    expect(priceLabel(seed('mindwiki'))).not.toContain('/mo')
    expect(priceLabel(seed('mindwiki'))).not.toContain('billed annually')
    expect(seed('makethemcode')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('makethemcode'))).toBe('$1 per 1M input tokens')
    expect(priceLabel(seed('makethemcode'))).not.toContain('/mo')
    expect(seed('cuedis')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('cuedis'))).toBe('Free tier, paid plans available')
    expect(seed('shotoku')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('shotoku'))).toBe('Free')
    expect(seed('get-shouting')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 24.99, hasFreeTier: false })
    expect(priceLabel(seed('get-shouting'))).toBe('$24.99 and up')
    expect(seed('leda')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('leda'))).toBe('Free')
    expect(seed('vb-notes')).toMatchObject({ pricingModel: 'free', priceFromUsd: null, hasFreeTier: true })
    expect(priceLabel(seed('vb-notes'))).toBe('Free')
    expect(seed('olbrain-alchemist')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 24, hasFreeTier: false })
    expect(priceLabel(seed('olbrain-alchemist'))).toBe('$24 and up')
    expect(seed('constor')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('constor'))).toBe('Pricing not published')
    expect(seed('dori')).toMatchObject({ pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false })
    expect(priceLabel(seed('dori'))).toBe('Pricing not published')
    expect(seed('olbrain-alchemist').longDesc).toContain('₹20,000')
    expect(seed('olbrain-alchemist').longDesc).toContain('not a dollar from-price')
    expect(seed('olbrain-alchemist').priceFromUsd).toBe(24)
    expect(seed('mindwiki').longDesc).toContain('$200 a year')
    expect(seed('geohats').longDesc).toContain('paid once')
    expect(seed('replay-mac').longDesc).toContain('paid once')
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('talyn').longDesc).toContain('free tier')
    expect(seed('talyn').longDesc).toContain('not the stored from-price')
    expect(seed('talyn').longDesc).toContain("vendor's public offer")
    expect(seed('rakazo').longDesc).toContain('free tier')
    expect(seed('rakazo').longDesc).toContain('not the stored from-price')
    expect(seed('rakazo').longDesc).toContain('not a free plan')
    expect(seed('enzo').longDesc).toContain('free tier')
    expect(seed('enzo').longDesc).toContain('not the stored from-price')
    expect(seed('enzo').longDesc).toContain('not a free plan')
    expect(seed('tesseract-eightcell').longDesc).toContain('free tier')
    expect(seed('tesseract-eightcell').longDesc).toContain('not a monthly plan')
    expect(seed('tesseract-eightcell').longDesc).toContain('not a free plan')
    expect(seed('tesseract-eightcell').longDesc).toContain('tesseract.dev')
    expect(seed('cobrain').longDesc).toContain('free tier')
    expect(seed('cobrain').longDesc).toContain('not the stored from-price')
    expect(seed('cobrain').longDesc).toContain("vendor's public offer")
    expect(seed('tulvo').longDesc).toContain('free tier')
    expect(seed('tulvo').longDesc).toContain('not the stored from-price')
    expect(seed('tulvo').longDesc).toContain('not a free plan')
    expect(seed('tulvo').longDesc).toContain('No promo code is stored')
    expect(seed('sendhour').longDesc).toContain('not the stored from-price')
    expect(seed('sendhour').longDesc).toContain('not a free plan')
    expect(seed('sendhour').longDesc).toContain('No free plan was found')
    expect(seed('geohats').longDesc).toContain('not the stored from-price')
    expect(seed('geohats').longDesc).toContain('not a free plan')
    expect(seed('geohats').longDesc).toContain('No free plan was found')
    expect(seed('tacie').longDesc).toContain('free tier')
    expect(seed('tacie').longDesc).toContain('not published')
    expect(seed('spark-site').longDesc).toContain('free tier')
    expect(seed('spark-site').longDesc).toContain('spark.site')
    expect(seed('spark-site').longDesc).toContain('not the stored from-price')
    expect(seed('corply').longDesc).toContain('not the stored from-price')
    expect(seed('corply').longDesc).toContain('not a free plan')
    expect(seed('corply').longDesc).toContain('No free plan was found')
    expect(seed('akked').longDesc).toContain('free tier')
    expect(seed('akked').longDesc).toContain('not the stored from-price')
    expect(seed('replay-mac').longDesc).toContain('No free plan was found')
    expect(seed('replay-mac').longDesc).toContain('tryreplay.online')
    expect(seed('mindwiki').longDesc).toContain('free tier')
    expect(seed('mindwiki').longDesc).toContain('not a monthly from-price')
    expect(seed('mindwiki').longDesc).toContain('not shown')
    expect(seed('makethemcode').longDesc).toContain('not a monthly plan')
    expect(seed('makethemcode').longDesc).toContain('not a free plan')
    expect(seed('makethemcode').longDesc).toContain('No free plan was found')
    expect(seed('cuedis').longDesc).toContain('free tier')
    expect(seed('cuedis').longDesc).toContain('not published')
    expect(seed('cuedis').longDesc).toContain('not a free plan')
    expect(seed('shotoku').longDesc).toContain('not published')
    expect(seed('get-shouting').longDesc).toContain('not the stored from-price')
    expect(seed('get-shouting').longDesc).toContain('not a free plan')
    expect(seed('get-shouting').longDesc).toContain('No free plan was found')
    expect(seed('leda').longDesc).toContain('No paid plan was found')
    expect(seed('vb-notes').longDesc).toContain('No paid plan was found')
    expect(seed('olbrain-alchemist').longDesc).toContain('not the stored from-price')
    expect(seed('olbrain-alchemist').longDesc).toContain('not a free plan')
    expect(seed('olbrain-alchemist').longDesc).toContain('No ongoing free plan was found')
    expect(seed('olbrain-alchemist').longDesc).not.toContain('press@')
    expect(seed('constor').longDesc).toContain('not published')
    expect(seed('constor').longDesc).toContain('not a free plan')
    expect(seed('dori').longDesc).toContain('no price is stored')
    expect(seed('dori').longDesc).toContain('No free plan is recorded')
  })

  it('seeds only Akked as an inactive program, and leaves the approved set unchanged', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(11)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
    }
    expect(seed('akked').affiliate).toEqual({
      hasProgram: true,
      network: 'in-house (partner program for freelancers and agencies, application form)',
      sourceUrl: 'https://akked.app/partners',
      status: 'inactive',
      commissionNote:
        '20% of what each referred store pays for 12 months from its first payment, or another rate agreed in writing. Paid manually around the 10th of each month once over $10, on payments older than 14 days. Recurring for 12 months. Not applied or accepted. No tracking link stored.',
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
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-15'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
    expect(scoutBlock).toContain('SCOUTED_2026_11_15')
    expect(scoutBlock).not.toContain('https://akked.app/partners?')
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
