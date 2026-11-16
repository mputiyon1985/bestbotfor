import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-16'
const SLUGS = [
  'zode',
  'stateweave',
  'glifa',
  'openbot',
  'byteask',
  'codecaine',
  'journzy',
  'maptake',
  'kugelaudio-fluid',
  'celesto',
  'bytevoice',
  'lingomic',
  'xeek-sites',
  'pharen-hub',
  'flamigo',
  'farside-research',
  'sonomos-locke',
  'syrev',
  'testaix',
  'cliedesk',
  'silversafe-ai',
  'puffin-agents',
  'designugc',
  'lexicad',
  'hemle',
  'folklore-hq',
  'offiai',
  'readywhen',
  'simpleton',
  'perit-marketplace',
  'labby',
  'yofluent',
  'formulate-ai',
  'dimensionkit',
  'newsology',
  'widefleet',
  'prodofoto',
  'agency-makors',
  'graphtia',
  'brainmate',
  'pammy',
  'moonbird',
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

describe('bot scout 2026-11-16', () => {
  it('adds 42 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(42)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(42)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(468)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(464)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(356)
    expect(toolSeeds.some((tool) => tool.slug === 'nail-my-interview' || tool.name === 'Nail My Interview')).toBe(false)
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
    expect(seed('openbot').name).toBe('OpenBot (CopilotKit)')
    expect(seed('openbot').vendor).toBe('CopilotKit')
    expect(seed('openbot').url).toBe('https://open.bot')
    expect(seed('kugelaudio-fluid').name).toBe('Fluid 1 (KugelAudio)')
    expect(seed('kugelaudio-fluid').vendor).toBe('KugelAudio')
    expect(seed('kugelaudio-fluid').url).toBe('https://kugelaudio.com/en/fluid-1')
    expect(seed('kugelaudio-fluid').allowedHosts).toEqual(['kugelaudio.com'])
    expect(seed('sonomos-locke').name).toBe('Locke (Sonomos)')
    expect(seed('sonomos-locke').vendor).toBe('Sonomos')
    expect(seed('sonomos-locke').url).toBe('https://sonomos.ai/locke')
    expect(seed('puffin-agents').name).toBe('Puffin')
    expect(seed('puffin-agents').url).toBe('https://www.justpuffin.tech')
    expect(seed('folklore-hq').name).toBe('Folklore')
    expect(seed('folklore-hq').url).toBe('https://folklorehq.com')
    expect(seed('testaix').name).toBe('TestAIx (SentrAIx)')
    expect(seed('testaix').vendor).toBe('SentrAIx')
    expect(seed('testaix').url).toBe('https://sentraix.com')
    expect(seed('agency-makors').name).toBe('Agency (makors)')
    expect(seed('agency-makors').vendor).toBe('makors')
    expect(seed('agency-makors').url).toBe('https://agency.makors.xyz')
    expect(seed('byteask').name).toBe('ByteAsk Cloud Agents')
    expect(seed('byteask').url).toBe('https://cloud.byteask.ai')
    expect(seed('glifa').vendor).toBe('Lukasz Majda')
    expect(seed('readywhen').name).toBe('readywhen')
    expect(toolSeeds.some((tool) => ['puffin', 'folklore', 'agency', 'locke', 'fluid', 'open-bot'].includes(tool.slug))).toBe(false)
    expect(seed('glifa').platforms).toEqual(['macOS'])
    expect(seed('codecaine').platforms).toEqual(['macOS'])
    expect(seed('bytevoice').platforms).toEqual(['macOS'])
    expect(seed('offiai').platforms).toEqual(['macOS'])
    expect(seed('simpleton').platforms).toEqual(['macOS'])
    expect(seed('lingomic').platforms).toEqual(['Windows', 'Web'])
    expect(seed('yofluent').platforms).toEqual(['Web', 'iOS'])
    expect(seed('openbot').platforms).toEqual(['Web', 'Self-hosted'])
    expect(seed('pharen-hub').platforms).toEqual(['Web', 'Self-hosted'])
    expect(seed('widefleet').platforms).toEqual(['Linux', 'Self-hosted', 'Web'])
    expect(seed('kugelaudio-fluid').platforms).toEqual([])
    expect(seed('sonomos-locke').platforms).toEqual([])
    expect(seed('silversafe-ai').platforms).toEqual([])
    expect(seed('readywhen').platforms).toEqual([])
    expect(seed('graphtia').platforms).toEqual([])
    expect(seed('agency-makors').platforms).toEqual([])
    expect(seed('brainmate').platforms).toEqual([])
    expect(seed('pammy').platforms).toEqual([])
  })

  it('keeps scout categories that already exist, including the ones with no Security, Education, Testing or Data category', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    const categories: Record<(typeof SLUGS)[number], string> = {
      zode: 'Development',
      stateweave: 'Development',
      glifa: 'Writing',
      openbot: 'Agent builder',
      byteask: 'Coding assistant',
      codecaine: 'Design',
      journzy: 'Writing',
      maptake: 'AI video',
      'kugelaudio-fluid': 'Voice',
      celesto: 'Development',
      bytevoice: 'Voice',
      lingomic: 'Meetings',
      'xeek-sites': 'Site builder',
      'pharen-hub': 'Productivity',
      flamigo: 'Productivity',
      'farside-research': 'Research',
      'sonomos-locke': 'Productivity',
      syrev: 'Research',
      testaix: 'Development',
      cliedesk: 'Automation',
      'silversafe-ai': 'Voice',
      'puffin-agents': 'Agent builder',
      designugc: 'AI video',
      lexicad: 'Design',
      hemle: 'Research',
      'folklore-hq': 'Productivity',
      offiai: 'Coding assistant',
      readywhen: 'Chat assistant',
      simpleton: 'Coding assistant',
      'perit-marketplace': 'Research',
      labby: 'Research',
      yofluent: 'Voice',
      'formulate-ai': 'Agent builder',
      dimensionkit: 'Automation',
      newsology: 'Research',
      widefleet: 'Development',
      prodofoto: 'Images',
      'agency-makors': 'Development',
      graphtia: 'Coding assistant',
      brainmate: 'Agent builder',
      pammy: 'Site builder',
      moonbird: 'AI video',
    }
    for (const slug of SLUGS) {
      expect(seed(slug).category, slug).toBe(categories[slug])
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Security', 'Education', 'Testing', 'Data', 'Marketing', 'Legal', 'Construction'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    const priced: Record<(typeof SLUGS)[number], { pricingModel: string; priceFromUsd: number | null; hasFreeTier: boolean; label: string }> = {
      zode: { pricingModel: 'paid', priceFromUsd: 20, hasFreeTier: false, label: '$20 and up' },
      stateweave: { pricingModel: 'freemium', priceFromUsd: 249, hasFreeTier: true, label: 'Free tier, then $249 and up' },
      glifa: { pricingModel: 'paid', priceFromUsd: 14.99, hasFreeTier: false, label: '$14.99 and up' },
      openbot: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free for personal use; business up to $29 a user' },
      byteask: { pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true, label: 'Free tier, then $20 and up' },
      codecaine: { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      journzy: { pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true, label: 'Free tier, then $19 and up' },
      maptake: { pricingModel: 'freemium', priceFromUsd: 40, hasFreeTier: true, label: 'Free tier, then $40 and up' },
      'kugelaudio-fluid': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      celesto: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$0.015 per hour' },
      bytevoice: { pricingModel: 'freemium', priceFromUsd: 12, hasFreeTier: true, label: 'Free tier, then $12/mo and up, billed annually' },
      lingomic: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$29 every 6 months' },
      'xeek-sites': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'pharen-hub': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      flamigo: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$2 for 2,000,000 credits' },
      'farside-research': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$15 for 500 credits' },
      'sonomos-locke': { pricingModel: 'freemium', priceFromUsd: 12.99, hasFreeTier: true, label: 'Free tier, then $12.99 and up' },
      syrev: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$149 per academic review' },
      testaix: { pricingModel: 'freemium', priceFromUsd: 39, hasFreeTier: true, label: 'Free tier, then $39 and up' },
      cliedesk: { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'silversafe-ai': { pricingModel: 'paid', priceFromUsd: 19.99, hasFreeTier: false, label: '$19.99 and up' },
      'puffin-agents': { pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false, label: '$25 and up' },
      designugc: { pricingModel: 'paid', priceFromUsd: 39.9, hasFreeTier: false, label: '$39.90 and up' },
      lexicad: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      hemle: { pricingModel: 'paid', priceFromUsd: 14.99, hasFreeTier: false, label: '$14.99 and up' },
      'folklore-hq': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      offiai: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      readywhen: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      simpleton: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'perit-marketplace': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      labby: { pricingModel: 'freemium', priceFromUsd: 12, hasFreeTier: true, label: 'Free tier, then $12 and up' },
      yofluent: { pricingModel: 'paid', priceFromUsd: 14.99, hasFreeTier: false, label: '$14.99 and up' },
      'formulate-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      dimensionkit: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during open beta; Starter planned at $19/mo' },
      newsology: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      widefleet: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      prodofoto: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'agency-makors': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      graphtia: { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      brainmate: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      pammy: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      moonbird: { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
    }
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const expected = priced[slug]
      expect(tool, slug).toMatchObject({
        pricingModel: expected.pricingModel,
        priceFromUsd: expected.priceFromUsd,
        hasFreeTier: expected.hasFreeTier,
      })
      expect(priceLabel(tool), slug).toBe(expected.label)
      if (slug !== 'bytevoice') expect(priceLabel(tool), slug).not.toContain('billed annually')
    }
    expect(seed('glifa').longDesc).toContain('paid once')
    expect(seed('glifa').longDesc).toContain('$14.99')
    expect(seed('glifa').longDesc).toContain('$19.99')
    expect(seed('bytevoice').longDesc).toContain('billed annually')
    expect(seed('maptake').longDesc).toContain('not the stored from-price')
    expect(seed('journzy').longDesc).toContain('$180')
    expect(seed('journzy').longDesc).toContain('yearly total')
    expect(seed('xeek-sites').longDesc).toContain('€12')
    expect(seed('xeek-sites').longDesc).toContain('€14.52')
    expect(seed('xeek-sites').longDesc).not.toMatch(/\$\d/)
    expect(seed('pharen-hub').longDesc).toContain('€25')
    expect(seed('pharen-hub').longDesc).toContain('€50')
    expect(seed('pharen-hub').longDesc).toContain('March 31, 2027')
    expect(seed('pharen-hub').longDesc).not.toMatch(/\$\d/)
    expect(seed('kugelaudio-fluid').longDesc).toContain('€0.05')
    expect(seed('kugelaudio-fluid').longDesc).toContain('€0.0595')
    expect(seed('kugelaudio-fluid').longDesc).not.toMatch(/\$\d/)
    expect(seed('offiai').longDesc).toContain('€0')
    expect(seed('offiai').longDesc).not.toMatch(/\$\d/)
    expect(seed('formulate-ai').longDesc).toContain('Indian rupees')
    expect(seed('formulate-ai').longDesc).toContain('No rupee rate is published')
    expect(seed('formulate-ai').longDesc).not.toMatch(/\$\d/)
    expect(seed('celesto').longDesc).toContain('$0.015')
    expect(seed('celesto').longDesc).toContain('not a monthly plan')
    expect(seed('lingomic').longDesc).toContain('$29 every 6 months')
    expect(seed('lingomic').longDesc).toContain('$39')
    expect(seed('flamigo').longDesc).toContain('$2')
    expect(seed('farside-research').longDesc).toContain('$15 for 500 credits')
    expect(seed('farside-research').longDesc).toContain('$9.99')
    expect(seed('syrev').longDesc).toContain('$149')
    expect(seed('syrev').longDesc).toContain('$29 a seat a month')
    expect(seed('syrev').longDesc).toContain('No promo code is stored')
    expect(seed('cliedesk').longDesc).toContain('No promo code is stored')
    expect(seed('cliedesk').longDesc).not.toMatch(/BFCM|STUDENT/i)
    expect(seed('syrev').longDesc).not.toMatch(/BFCM|STUDENT99/)
    expect(seed('lexicad').longDesc).toContain('no price is stored')
    expect(seed('dimensionkit').longDesc).toContain('$19 a month')
    expect(seed('dimensionkit').longDesc).toContain('not charged yet')
    expect(seed('prodofoto').longDesc).toContain('roughly $1')
    expect(seed('prodofoto').priceFromUsd).toBeNull()
    expect(seed('yofluent').longDesc).toContain('$14.99')
    expect(seed('yofluent').longDesc).toContain('$59.99')
    expect(seed('openbot').priceFromUsd).toBeNull()
    expect(seed('openbot').longDesc).toContain('open.bot')
    expect(seed('puffin-agents').longDesc).toContain('justpuffin.tech')
    expect(seed('puffin-agents').longDesc).toContain('not the Puffin browser')
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
      expect(copy, slug).not.toMatch(/BFCM60|STUDENT99|NAIL50/)
    }
    expect(seed('zode').longDesc).toContain('not a free plan')
    expect(seed('zode').longDesc).toContain('No free plan was found')
    expect(seed('stateweave').longDesc).toContain('free tier')
    expect(seed('glifa').longDesc).toContain('not a free plan')
    expect(seed('codecaine').longDesc).toContain('No paid plan was found')
    expect(seed('agency-makors').longDesc).toContain('No paid plan was found')
    expect(seed('maptake').longDesc).toContain('No promo code is stored')
    expect(seed('readywhen').longDesc).toContain('no free plan is recorded')
    expect(seed('simpleton').longDesc).toContain('No free plan is recorded')
    expect(seed('perit-marketplace').longDesc).toContain('No free plan is recorded')
    expect(seed('brainmate').longDesc).toContain('No free plan is recorded')
    expect(seed('pammy').longDesc).toContain('No free plan is recorded')
    expect(seed('moonbird').longDesc).toContain('No free plan is recorded')
    expect(seed('newsology').longDesc).toContain('free tier')
    expect(seed('widefleet').longDesc).toContain('not published')
    expect(seed('folklore-hq').longDesc).toContain('not published')
  })

  it('leaves every new tool on the empty affiliate and does not change the approved set', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(13)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    for (const slug of ['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane'] as const) {
      expect(seed(slug).affiliate.status).toBe('active')
      expect(seed(slug).affiliate.affiliateUrl).toMatch(/^https:\/\//)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-16'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
    expect(scoutBlock).toContain('SCOUTED_2026_11_16')
    expect(scoutBlock).not.toContain('nail-my-interview')
    expect(scoutBlock).not.toContain('BFCM60')
    expect(scoutBlock).not.toContain('STUDENT99')
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
