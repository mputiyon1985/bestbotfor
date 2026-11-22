import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-18'
const SLUGS = [
  'ridian',
  'vetoo',
  'revix-ai',
  'foxplug',
  'openstate',
  'textend',
  'klipa-ai',
  'atlas-compiler',
  'plinth-cloud',
  'ui-verify',
  'polyroom',
  'machinence',
  'ai-canvas',
  'arcade-ai-video',
  'anyimg',
  'mermaid-flow',
  's-space',
  'incredible-agents',
  'trustsniffer',
  'dusk-bot',
  'agent-co-founder',
  'profittriage-ai',
  'novatek-book-publishing',
  'cleanbleep',
  'text-to-gif',
  'opendesign',
  'dippr',
  'waldo-wherobots',
  'model-citizens-studio',
  'ringvia',
  'letterslot',
  'citewing',
  'marketing-decks',
  'regga',
  'helpwing',
  'docup',
  'quantmarketai',
  'qbit-elixir-labs',
  'storybook-ai',
  'tengochat',
  'scanaris',
  'toozi',
  'face-shape-haircut-ai',
  'ai-music-maker',
  'rally-ai',
  'crosshead',
  'sikemux',
  'aktor',
  'spokendocs',
  'college-essay-grader',
  'liveswap-ai',
  'mirra-ai',
  'transinaut',
  'editedimage',
  'hostbloom',
  'ody-ai-phone',
  'saas-toolkit-mcp',
  'orbit-x',
  'nutri-ai',
  'polipoll-surveys',
  'spiritual-origin',
  'fefou',
  'truinttrip',
  'fardesk',
  'search2o',
  'toone',
  'confidential-ai-cloud',
  'voplica-studio',
  'tinocall-ai-receptionist',
  'yakafa',
  'inferbase-ai',
  'mixos',
  'baylo',
  'to3d',
  'warmprose',
  'pugsoda',
  'whiz-pub',
  'takehound',
  'toolmaker-agent',
  'soreqen-code',
  'kadeep-ai',
  'flashjini',
  'makemidas',
  'firsttake',
  'waggle',
  'verspa',
  'signal-harbor',
  'authentify',
  'lally-ai',
  'lyra-labs',
  'agentready-mcp',
  'vocelle',
  'rapvid',
  'caughtthemagic',
  'mdkit',
  'qpilot',
  'vanira',
  'urun',
  'idressy',
  'modern-computer',
  'my-professional-headshot',
  'pablit',
  'trnrt',
  'solipsist',
  'tutorbee',
  'debo-ai',
  'dynos-work',
  'basellm',
  'archon-ai',
  'opstether',
  'rising-tide-digital',
  'niveau7',
  'tokenguard-os',
  'streaker-app',
  'agav',
  'solarian',
  'r3-hyperlogue',
  'yantra-app',
  'murer-ai',
  'ai-spar',
  'bysicle',
  'docdost-ai',
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

describe('bot scout 2026-11-18', () => {
  it('adds 122 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(122)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(122)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(1113)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(1109)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(1001)
    for (const slug of SLUGS) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(SCOUT)
      expect(tool.lastVerifiedAt, slug).toBe(SCOUT)
      expect(tool.fits, slug).toEqual([])
      expect(tool.unlisted, slug).toBeFalsy()
      expect(tool.needsVerification, slug).toBeFalsy()
      if (slug !== 'streaker-app') expect(tool.url.includes('?'), slug).toBe(false)
      expect(tool.url.startsWith('https://'), slug).toBe(true)
      expect(tool.affiliate.affiliateUrl, slug).toBeUndefined()
      if (slug === 'streaker-app') {
        expect(tool.allowedHosts, slug).toEqual(['play.google.com', 'play.google.com/store/apps/details?id=com.streaker.streaker'])
      } else {
        expect(tool.allowedHosts, slug).toEqual([new URL(tool.url).hostname])
      }
      expect(unratedSlugs, slug).toContain(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/the scout found|catalog URL|sourced from|query string|hand-off|handoff/i)
    }
    expect(seed('waldo-wherobots').name).toBe('Waldo by Wherobots')
    expect(seed('waldo-wherobots').vendor).toBe('Wherobots')
    expect(seed('waldo-wherobots').url).toBe('https://wherobots.com/products/waldo')
    expect(seed('mermaid-flow').vendor).toBe('Mermaid Chart')
    expect(seed('mermaid-flow').url).toBe('https://mermaid.ai/products/flow')
    expect(seed('qbit-elixir-labs').vendor).toBe('Elixir Labs')
    expect(seed('qbit-elixir-labs').url).toBe('https://www.qbitbuilds.in')
    expect(seed('bysicle').name).toBe('Bicycle')
    expect(seed('bysicle').url).toBe('https://www.bysicle.com')
    expect(seed('ody-ai-phone').vendor).toBe('Origns Inc.')
    expect(seed('ody-ai-phone').url).toBe('https://ody.co')
    expect(seed('atlas-compiler').url).toBe('https://atlas-compiler.com')
    expect(seed('r3-hyperlogue').vendor).toBe('Hyperlogue')
    expect(seed('r3-hyperlogue').url).toBe('https://r3.hyperlogue.tech')
    expect(seed('rally-ai').url).toBe('https://rallywith.ai')
    expect(seed('plinth-cloud').url).toBe('https://useplinth.cloud')
    expect(seed('arcade-ai-video').url).toBe('https://arcade.software')
    expect(seed('confidential-ai-cloud').url).toBe('https://confidential.ai')
    expect(seed('streaker-app').url).toBe('https://play.google.com/store/apps/details?id=com.streaker.streaker')
    expect(seed('streaker-app').longDesc).toContain('com.streaker.streaker')
    expect(seed('streaker-app').longDesc).not.toMatch(/catalog URL|query string/i)
    expect(seed('docdost-ai').url).toBe('https://apps.apple.com/us/app/docdost-ai/id6828870317')
    expect(seed('docdost-ai').url).not.toContain('at=')
    expect(`${seed('docdost-ai').shortDesc} ${seed('docdost-ai').longDesc}`).not.toContain('at=')
  })

  it('keeps scout categories that already exist', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    const categories: Record<(typeof SLUGS)[number], string> = {
      'ridian': 'Productivity',
      'vetoo': 'Coding assistant',
      'revix-ai': 'Coding assistant',
      'foxplug': 'Vibe coding',
      'openstate': 'Coding assistant',
      'textend': 'Writing',
      'klipa-ai': 'Video editing',
      'atlas-compiler': 'Development',
      'plinth-cloud': 'App builder',
      'ui-verify': 'Coding assistant',
      'polyroom': 'Agent builder',
      'machinence': 'Site builder',
      'ai-canvas': 'Design',
      'arcade-ai-video': 'AI video',
      'anyimg': 'Images',
      'mermaid-flow': 'Agent builder',
      's-space': 'Agent builder',
      'incredible-agents': 'Productivity',
      'trustsniffer': 'Research',
      'dusk-bot': 'Agent builder',
      'agent-co-founder': 'Automation',
      'profittriage-ai': 'Productivity',
      'novatek-book-publishing': 'Writing',
      'cleanbleep': 'Video editing',
      'text-to-gif': 'Images',
      'opendesign': 'Design',
      'dippr': 'Development',
      'waldo-wherobots': 'Development',
      'model-citizens-studio': 'AI video',
      'ringvia': 'Voice',
      'letterslot': 'Productivity',
      'citewing': 'SEO',
      'marketing-decks': 'Design',
      'regga': 'Research',
      'helpwing': 'Meetings',
      'docup': 'Development',
      'quantmarketai': 'Research',
      'qbit-elixir-labs': 'Vibe coding',
      'storybook-ai': 'Design',
      'tengochat': 'Chat assistant',
      'scanaris': 'Development',
      'toozi': 'Automation',
      'face-shape-haircut-ai': 'Images',
      'ai-music-maker': 'Music',
      'rally-ai': 'Productivity',
      'crosshead': 'Coding assistant',
      'sikemux': 'Coding assistant',
      'aktor': 'Agent builder',
      'spokendocs': 'Voice',
      'college-essay-grader': 'Writing',
      'liveswap-ai': 'AI video',
      'mirra-ai': 'Chat assistant',
      'transinaut': 'Research',
      'editedimage': 'Images',
      'hostbloom': 'Images',
      'ody-ai-phone': 'Voice',
      'saas-toolkit-mcp': 'Automation',
      'orbit-x': 'Writing',
      'nutri-ai': 'Chat assistant',
      'polipoll-surveys': 'Research',
      'spiritual-origin': 'Chat assistant',
      'fefou': 'Automation',
      'truinttrip': 'Automation',
      'fardesk': 'Development',
      'search2o': 'Agent builder',
      'toone': 'Automation',
      'confidential-ai-cloud': 'Development',
      'voplica-studio': 'AI video',
      'tinocall-ai-receptionist': 'Voice',
      'yakafa': 'Productivity',
      'inferbase-ai': 'Development',
      'mixos': 'Design',
      'baylo': 'Productivity',
      'to3d': 'Design',
      'warmprose': 'Writing',
      'pugsoda': 'AI video',
      'whiz-pub': 'Site builder',
      'takehound': 'Video editing',
      'toolmaker-agent': 'Development',
      'soreqen-code': 'Coding assistant',
      'kadeep-ai': 'Development',
      'flashjini': 'Productivity',
      'makemidas': 'AI video',
      'firsttake': 'AI video',
      'waggle': 'Agent builder',
      'verspa': 'Agent builder',
      'signal-harbor': 'SEO',
      'authentify': 'Development',
      'lally-ai': 'Automation',
      'lyra-labs': 'Research',
      'agentready-mcp': 'Development',
      'vocelle': 'Voice',
      'rapvid': 'AI video',
      'caughtthemagic': 'Images',
      'mdkit': 'Productivity',
      'qpilot': 'Development',
      'vanira': 'Agent builder',
      'urun': 'Voice',
      'idressy': 'Images',
      'modern-computer': 'Agent builder',
      'my-professional-headshot': 'Images',
      'pablit': 'Design',
      'trnrt': 'Development',
      'solipsist': 'Writing',
      'tutorbee': 'Chat assistant',
      'debo-ai': 'Productivity',
      'dynos-work': 'Coding assistant',
      'basellm': 'Development',
      'archon-ai': 'Agent builder',
      'opstether': 'Development',
      'rising-tide-digital': 'SEO',
      'niveau7': 'Voice',
      'tokenguard-os': 'Development',
      'streaker-app': 'Productivity',
      'agav': 'Coding assistant',
      'solarian': 'Development',
      'r3-hyperlogue': 'Development',
      'yantra-app': 'Automation',
      'murer-ai': 'Chat assistant',
      'ai-spar': 'Research',
      'bysicle': 'Coding assistant',
      'docdost-ai': 'Productivity',
    }
    for (const slug of SLUGS) {
      expect(existing.has(categories[slug]), slug).toBe(true)
      expect(seed(slug).category, slug).toBe(categories[slug])
    }
  })

  it('stores monthly dollar prices, leaves other prices unpublished, and records platforms', () => {
    const priced: Record<(typeof SLUGS)[number], { pricingModel: 'free' | 'freemium' | 'paid'; priceFromUsd: number | null; hasFreeTier: boolean; label: string }> = {
      'ridian': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'vetoo': { pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true, label: 'Free tier, then $20 and up' },
      'revix-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'foxplug': { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'openstate': { pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true, label: 'Free tier, then $10 and up' },
      'textend': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then $29.99 once' },
      'klipa-ai': { pricingModel: 'freemium', priceFromUsd: 14.99, hasFreeTier: true, label: 'Free tier, then $14.99 and up' },
      'atlas-compiler': { pricingModel: 'freemium', priceFromUsd: 9, hasFreeTier: true, label: 'Free tier, then $9 and up' },
      'plinth-cloud': { pricingModel: 'freemium', priceFromUsd: 2, hasFreeTier: true, label: 'Free tier, then $2 and up' },
      'ui-verify': { pricingModel: 'freemium', priceFromUsd: 89, hasFreeTier: true, label: 'Free tier, then $89 and up' },
      'polyroom': { pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true, label: 'Free tier, then $15 and up' },
      'machinence': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '£99 a month' },
      'ai-canvas': { pricingModel: 'freemium', priceFromUsd: 8.99, hasFreeTier: true, label: 'Free tier, then $8.99 and up' },
      'arcade-ai-video': { pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true, label: 'Free tier, then $49/mo and up, billed annually' },
      'anyimg': { pricingModel: 'paid', priceFromUsd: 9.9, hasFreeTier: false, label: '$9.90 and up' },
      'mermaid-flow': { pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true, label: 'Free tier, then $10/mo and up, billed annually' },
      's-space': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'incredible-agents': { pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false, label: '$25 and up' },
      'trustsniffer': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'dusk-bot': { pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true, label: 'Free tier, then $20 and up' },
      'agent-co-founder': { pricingModel: 'freemium', priceFromUsd: 15, hasFreeTier: true, label: 'Free tier, then $15 and up' },
      'profittriage-ai': { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'novatek-book-publishing': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$179 per book' },
      'cleanbleep': { pricingModel: 'freemium', priceFromUsd: 8.99, hasFreeTier: true, label: 'Free tier, then $8.99 and up' },
      'text-to-gif': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$10 for 440 credits' },
      'opendesign': { pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true, label: 'Free tier, then $10 and up' },
      'dippr': { pricingModel: 'freemium', priceFromUsd: 150, hasFreeTier: true, label: 'Free tier, then $150 and up' },
      'waldo-wherobots': { pricingModel: 'paid', priceFromUsd: 95, hasFreeTier: false, label: '$95 and up' },
      'model-citizens-studio': { pricingModel: 'paid', priceFromUsd: 297, hasFreeTier: false, label: '$297 and up' },
      'ringvia': { pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false, label: '$49 and up' },
      'letterslot': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then €24 once' },
      'citewing': { pricingModel: 'paid', priceFromUsd: 95, hasFreeTier: false, label: '$95 and up' },
      'marketing-decks': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'regga': { pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true, label: 'Free tier, then $5 and up' },
      'helpwing': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$6 for 60 minutes' },
      'docup': { pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true, label: 'Free tier, then $49 and up' },
      'quantmarketai': { pricingModel: 'freemium', priceFromUsd: 39, hasFreeTier: true, label: 'Free tier, then $39 and up' },
      'qbit-elixir-labs': { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'storybook-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free to try; plan prices not published' },
      'tengochat': { pricingModel: 'paid', priceFromUsd: 12, hasFreeTier: false, label: '$12 and up' },
      'scanaris': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'toozi': { pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false, label: '$49 and up' },
      'face-shape-haircut-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'From $9.99; billing period not stated' },
      'ai-music-maker': { pricingModel: 'paid', priceFromUsd: 19.9, hasFreeTier: false, label: '$19.90 and up' },
      'rally-ai': { pricingModel: 'freemium', priceFromUsd: 100, hasFreeTier: true, label: 'Free tier, then $100 and up' },
      'crosshead': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier; $1 for 1,000 credits' },
      'sikemux': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'aktor': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'spokendocs': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then €79 once' },
      'college-essay-grader': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then $4.99 per essay' },
      'liveswap-ai': { pricingModel: 'paid', priceFromUsd: 12, hasFreeTier: false, label: '$12 and up' },
      'mirra-ai': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'transinaut': { pricingModel: 'freemium', priceFromUsd: 39, hasFreeTier: true, label: 'Free tier, then $39 and up' },
      'editedimage': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier; paid packs not on sale' },
      'hostbloom': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$1.20 for 5 credits' },
      'ody-ai-phone': { pricingModel: 'paid', priceFromUsd: 15, hasFreeTier: false, label: '$15/mo and up, billed annually' },
      'saas-toolkit-mcp': { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'orbit-x': { pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false, label: '$19 and up' },
      'nutri-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '₹399 a month' },
      'polipoll-surveys': { pricingModel: 'freemium', priceFromUsd: 149, hasFreeTier: true, label: 'Free tier, then $149 and up' },
      'spiritual-origin': { pricingModel: 'freemium', priceFromUsd: 14.99, hasFreeTier: true, label: 'Free tier, then $14.99 and up' },
      'fefou': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'truinttrip': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then $79 a year' },
      'fardesk': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'search2o': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free; paid cloud not open yet' },
      'toone': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'confidential-ai-cloud': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$68 per hour' },
      'voplica-studio': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'tinocall-ai-receptionist': { pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false, label: '$99 and up' },
      'yakafa': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '€9 a month' },
      'inferbase-ai': { pricingModel: 'freemium', priceFromUsd: 25, hasFreeTier: true, label: 'Free tier, then $25 and up' },
      'mixos': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'baylo': { pricingModel: 'paid', priceFromUsd: 5.42, hasFreeTier: false, label: '$5.42/mo and up, billed annually' },
      'to3d': { pricingModel: 'paid', priceFromUsd: 10, hasFreeTier: false, label: '$10 and up' },
      'warmprose': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free checks; full rewrite price not published' },
      'pugsoda': { pricingModel: 'paid', priceFromUsd: 14, hasFreeTier: false, label: '$14 and up' },
      'whiz-pub': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'takehound': { pricingModel: 'paid', priceFromUsd: 50, hasFreeTier: false, label: '$50 and up' },
      'toolmaker-agent': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'soreqen-code': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'kadeep-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'flashjini': { pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true, label: 'Free tier, then $19 and up' },
      'makemidas': { pricingModel: 'paid', priceFromUsd: 50, hasFreeTier: false, label: '$50 and up' },
      'firsttake': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$9 once' },
      'waggle': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'verspa': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '£999 a month' },
      'signal-harbor': { pricingModel: 'paid', priceFromUsd: 799, hasFreeTier: false, label: '$799 and up' },
      'authentify': { pricingModel: 'paid', priceFromUsd: 50, hasFreeTier: false, label: '$50 and up' },
      'lally-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, then ₹6,999 a month' },
      'lyra-labs': { pricingModel: 'freemium', priceFromUsd: 39, hasFreeTier: true, label: 'Free tier, then $39 and up' },
      'agentready-mcp': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during beta; token rates are not a monthly plan' },
      'vocelle': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'rapvid': { pricingModel: 'paid', priceFromUsd: 12.9, hasFreeTier: false, label: '$12.90 and up' },
      'caughtthemagic': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free preview, then $3.49 for 5 credits' },
      'mdkit': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'qpilot': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'vanira': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'urun': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'idressy': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'modern-computer': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'my-professional-headshot': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$9.90 for 3 credits' },
      'pablit': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'trnrt': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'solipsist': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'tutorbee': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'debo-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free to start; paid plans not set yet' },
      'dynos-work': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'basellm': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'archon-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'opstether': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during beta; paid price not published' },
      'rising-tide-digital': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free snapshot; full audit price not published' },
      'niveau7': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'tokenguard-os': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'streaker-app': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'agav': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'solarian': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'r3-hyperlogue': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'yantra-app': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'murer-ai': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'ai-spar': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'bysicle': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'docdost-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
    }
    const platforms: Record<(typeof SLUGS)[number], string[]> = {
      'ridian': ['Web'],
      'vetoo': ['Web'],
      'revix-ai': ['Web'],
      'foxplug': ['Web'],
      'openstate': [],
      'textend': ['Web'],
      'klipa-ai': ['Web'],
      'atlas-compiler': ['Web'],
      'plinth-cloud': ['Web'],
      'ui-verify': ['Web'],
      'polyroom': ['Web'],
      'machinence': ['Web'],
      'ai-canvas': ['Web'],
      'arcade-ai-video': ['Web'],
      'anyimg': ['Web'],
      'mermaid-flow': ['Web'],
      's-space': ['Web'],
      'incredible-agents': ['Web'],
      'trustsniffer': ['Web'],
      'dusk-bot': ['Web'],
      'agent-co-founder': ['Web'],
      'profittriage-ai': ['Web'],
      'novatek-book-publishing': ['Web'],
      'cleanbleep': ['Web'],
      'text-to-gif': ['Web'],
      'opendesign': ['Web'],
      'dippr': ['Web'],
      'waldo-wherobots': ['Web'],
      'model-citizens-studio': ['Web'],
      'ringvia': ['Web'],
      'letterslot': ['macOS'],
      'citewing': ['Web'],
      'marketing-decks': ['Web'],
      'regga': ['Web'],
      'helpwing': ['macOS', 'Windows'],
      'docup': ['Web'],
      'quantmarketai': ['Web'],
      'qbit-elixir-labs': ['Web'],
      'storybook-ai': ['Web'],
      'tengochat': ['Web'],
      'scanaris': ['Web'],
      'toozi': ['Web'],
      'face-shape-haircut-ai': ['Web'],
      'ai-music-maker': ['Web'],
      'rally-ai': ['Web'],
      'crosshead': [],
      'sikemux': [],
      'aktor': ['Web'],
      'spokendocs': ['macOS'],
      'college-essay-grader': ['Web'],
      'liveswap-ai': ['Web'],
      'mirra-ai': ['Web'],
      'transinaut': ['Web'],
      'editedimage': ['Web'],
      'hostbloom': ['Web'],
      'ody-ai-phone': ['Web'],
      'saas-toolkit-mcp': ['Web'],
      'orbit-x': ['Web'],
      'nutri-ai': ['Web'],
      'polipoll-surveys': ['Web'],
      'spiritual-origin': ['Web'],
      'fefou': ['Web'],
      'truinttrip': ['Web'],
      'fardesk': [],
      'search2o': ['Web'],
      'toone': ['macOS'],
      'confidential-ai-cloud': ['Web'],
      'voplica-studio': ['Web'],
      'tinocall-ai-receptionist': ['Web'],
      'yakafa': ['Web'],
      'inferbase-ai': ['Web'],
      'mixos': ['Web'],
      'baylo': ['Web'],
      'to3d': ['Web'],
      'warmprose': ['Web'],
      'pugsoda': ['Web'],
      'whiz-pub': ['Web'],
      'takehound': ['Web'],
      'toolmaker-agent': ['Web'],
      'soreqen-code': ['Web'],
      'kadeep-ai': ['Web'],
      'flashjini': ['Web'],
      'makemidas': ['Web'],
      'firsttake': ['macOS'],
      'waggle': ['Web'],
      'verspa': ['Web'],
      'signal-harbor': ['Web'],
      'authentify': ['Web'],
      'lally-ai': ['Web'],
      'lyra-labs': ['Web'],
      'agentready-mcp': ['Web'],
      'vocelle': [],
      'rapvid': ['Web'],
      'caughtthemagic': ['Web'],
      'mdkit': [],
      'qpilot': ['Chrome'],
      'vanira': ['Web'],
      'urun': ['Web'],
      'idressy': ['Web'],
      'modern-computer': ['Web'],
      'my-professional-headshot': ['Web'],
      'pablit': ['Web'],
      'trnrt': [],
      'solipsist': [],
      'tutorbee': ['Web'],
      'debo-ai': ['Web'],
      'dynos-work': [],
      'basellm': ['Web'],
      'archon-ai': ['Web'],
      'opstether': ['Web'],
      'rising-tide-digital': ['Web'],
      'niveau7': ['Web'],
      'tokenguard-os': ['Web'],
      'streaker-app': ['Android'],
      'agav': [],
      'solarian': ['Web'],
      'r3-hyperlogue': ['Web'],
      'yantra-app': ['Web'],
      'murer-ai': ['Web'],
      'ai-spar': ['Web'],
      'bysicle': [],
      'docdost-ai': ['iOS'],
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
      expect(tool.platforms, slug).toEqual(platforms[slug])
    }
    for (const slug of ["ridian","revix-ai","machinence","letterslot","scanaris","spokendocs","nutri-ai","fefou","yakafa","verspa","lally-ai"] as const) {
      expect(seed(slug).longDesc, slug).not.toMatch(/\$\d/)
      expect(seed(slug).priceFromUsd, slug).toBeNull()
    }
    expect(seed('ringvia').longDesc).toContain('$49')
    expect(seed('ringvia').longDesc).toContain('CAD')
    expect(seed('helpwing').longDesc).toContain('₹299')
    expect(seed('helpwing').longDesc).toContain('$6')
    expect(seed('helpwing').priceFromUsd).toBeNull()
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('ridian').longDesc).toContain('No promo code is stored')
    expect(seed('machinence').longDesc).toContain('No promo code is stored')
    expect(seed('citewing').longDesc).toContain('No promo code is stored')
  })

  it('leaves every new tool on the empty affiliate and does not change the approved set', () => {
    expect(APPROVED_ACTIVE_AFFILIATES).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane', 'snapdub'])
    expect(APPROVED_ACTIVE_AFFILIATES).toHaveLength(14)
    expect(PREPARED_AFFILIATE_SLUGS).toEqual(['elevenlabs', 'synthesia', 'descript', 'murf', 'papermark', 'docsalot', 'sendr', 'julius-ai', 'context-dev', 'videco', 'getimg', 'rankfender', 'polylane', 'snapdub', 'writesonic', 'lovable'])
    for (const slug of SLUGS) {
      expect(APPROVED_ACTIVE_AFFILIATES, slug).not.toContain(slug)
      expect(PREPARED_AFFILIATE_SLUGS as readonly string[], slug).not.toContain(slug)
      expect(seed(slug).affiliate, slug).toEqual(NONE)
      expect(servesAffiliateLink(slug, null, seed(slug).affiliate.status), slug).toBe(false)
    }
    const catalog = readFileSync(new URL('../data/catalog.ts', import.meta.url), 'utf8')
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-18'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
    expect(scoutBlock).not.toContain('RIDIANPH50')
    expect(scoutBlock).not.toContain('LAUNCH30')
    expect(scoutBlock).not.toContain('1000l6eA')
    expect(scoutBlock).toContain('SCOUTED_2026_11_18')
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
      if (slug === 'streaker-app') {
        expect(new URL(head.location).search, slug).toBe('?id=com.streaker.streaker')
      } else {
        expect(new URL(head.location).search, slug).toBe('')
      }
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
      if (slug === 'streaker-app') {
        expect(destination.searchParams.get('id'), slug).toBe('com.streaker.streaker')
        expect([...destination.searchParams.keys()].sort(), slug).toEqual(['id', 'utm_campaign', 'utm_medium', 'utm_source'])
      } else {
        expect([...destination.searchParams.keys()].sort(), slug).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
      }
      expect(get.location, slug).not.toMatch(/rewardful|camp_id|cello|endorsely|im_ref|via=|ref=|creators|sponsored/)
      expect(get.click?.affiliate, slug).toBe(false)
      expect(get.click?.subIdParam, slug).toBeNull()
    }
  })
})
