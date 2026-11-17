import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { unratedSlugs } from '@/data/scores-v23.seed'
import { APPROVED_ACTIVE_AFFILIATES, PREPARED_AFFILIATE_SLUGS } from './affiliate-admin'
import { priceLabel } from './format'
import { resolveGoRedirect, resolveHeadGoRedirect, servesAffiliateLink } from './go-redirect'

const SCOUT = '2026-11-17'
const SLUGS = [
  'rankspot',
  'coral-gateway',
  'superhands',
  'zeus-agent',
  'haris',
  'wiyomi',
  'vezapi',
  'motionrepo',
  'fonazo',
  'novatoken',
  'artie',
  'link-bio',
  'recall-agents-api',
  'arvak',
  'faros-desktop',
  'oll-e',
  'ollav',
  'contactai-desk',
  'chat-cx',
  'simular-box',
  'pizza-agent',
  'eqvesta',
  'longformly',
  'vinc',
  'glass-page',
  'ballet',
  'keybrum',
  'design-lounge',
  'elco-console',
  'human-in-circuit',
  'delightful-click',
  'nova-creative',
  'coderbaba',
  'nasiko',
  'quiksignal',
  'cloudish',
  'inbox-hero',
  'acta-ai',
  'scatter-study',
  'oraculum',
  'darkcrate',
  'arcroom',
  'askprobe',
  'goaltree',
  'uagents8',
  'ivibe',
  'text-to-cad-studio',
  'skillsmcp',
  'mightywatcher',
  'nestdaddy',
  'turbogen',
  'securethread',
  'backplane',
  'circles-whatsapp',
  'marsell',
  'ivycraft',
  'hako',
  'base-studio',
  'archseed',
  'speakapp',
  'narwal',
  'storewalk',
  'blushadow',
  'next3d',
  'codela',
  'deeepspace',
  'tallbell',
  'versine',
  'superlog',
  'lasso-mac',
  'wispos',
  'trading-agents',
  'sondia',
  'kira-id',
  'syniru',
  'semdex',
  'wakel',
  'senaste',
  'buzzmark',
  'unmerge',
  'thebold',
  'pinecall',
  'strokes',
  'vigilbase-os',
  'habakkuk',
  'dravik',
  'omnitome',
  'trial-commander',
  'crawlito',
  'agent-capability-contract',
  'lectio',
  'interviewengine',
  'designforge',
  'plan-chat',
  'wron',
  'retriever-app',
  'descant',
  'boomship',
  'chalkie',
  'hexta-ai',
  'greenci',
  'ringzee',
  'youxr',
  'al-narjis-ai',
  'orama-lake',
  'astral-homeschool',
  'attest-agents',
  'botora',
  'aidealy',
  'talknative',
  'clamor',
  'gatherhq-agent-research',
  'ai-visibility-by-trulata',
  'infaiw',
  'hotline-computer',
  'deep-agnt',
  'dearinside',
  'reachpilot',
  'cadreen-model-training',
  'precedent-ai',
  'engine7',
  'apertrue-witness',
  'corpfinai',
  'kino-ai',
  'mova',
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

describe('bot scout 2026-11-17', () => {
  it('adds 125 unique unrated tools and does not reuse a slug', () => {
    expect(new Set(SLUGS).size).toBe(125)
    expect(toolSeeds.filter((tool) => SLUGS.includes(tool.slug as (typeof SLUGS)[number]))).toHaveLength(125)
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)
    expect(toolSeeds).toHaveLength(593)
    expect(toolSeeds.filter((tool) => !tool.unlisted)).toHaveLength(589)
    expect(toolSeeds.filter((tool) => tool.unlisted)).toHaveLength(4)
    expect(unratedSlugs).toHaveLength(481)
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
    expect(seed('coral-gateway').name).toBe('Coral')
    expect(seed('coral-gateway').url).toBe('https://withcoral.com')
    expect(seed('zeus-agent').name).toBe('ZEUS')
    expect(seed('zeus-agent').url).toBe('https://zeus-agent.web.app')
    expect(seed('apertrue-witness').name).toBe('Apertrue Witness')
    expect(seed('apertrue-witness').url).toBe('https://witness.apertrue.photo')
    expect(seed('witness').url).not.toBe(seed('apertrue-witness').url)
    expect(seed('circles-whatsapp').name).toBe('Circles for WhatsApp')
    expect(seed('circles-whatsapp').url).toBe('https://usecircles.app/en')
    expect(seed('retriever-app').name).toBe('Retriever')
    expect(seed('retriever-app').url).toBe('https://play.google.com/store/apps/details')
    expect(seed('retriever-app').longDesc).toContain('app.retriever')
    expect(seed('askprobe').name).toBe('Probe')
    expect(seed('askprobe').url).toBe('https://askprobe.com')
    expect(seed('acta-ai').name).toBe('Acta')
    expect(seed('acta-ai').url).toBe('https://acta.ai')
    expect(seed('trading-agents').name).toBe('Trading Agents (Alpha Vantage)')
    expect(seed('trading-agents').vendor).toBe('Alpha Vantage')
    expect(seed('trading-agents').url).toBe('https://trading-agents.ai')
    expect(seed('simular-box').name).toBe('box (Simular)')
    expect(seed('simular-box').vendor).toBe('Simular')
    expect(seed('simular-box').url).toBe('https://box.simular.ai')
    expect(seed('semdex').name).toBe('Semdex (ContextLM)')
    expect(seed('semdex').vendor).toBe('ContextLM')
    expect(seed('semdex').url).toBe('https://agent.contextlm.top')
    expect(seed('plan-chat').vendor).toBe('AI Architectures')
    expect(seed('plan-chat').url).toBe('https://cad.ai-architectures.com')
    expect(seed('recall-agents-api').vendor).toBe('Recall.ai')
    expect(seed('recall-agents-api').url).toBe('https://www.recall.ai/agents')
    expect(seed('superhands').url).toBe('https://superhands.ai')
    expect(toolSeeds.some((tool) => ['coral', 'zeus', 'circles', 'retriever', 'probe', 'acta', 'box', 'lasso'].includes(tool.slug))).toBe(false)
  })

  it('keeps scout categories that already exist, including the ones with no Security, Sales, Marketing, Finance or Education category', () => {
    const existing = new Set(toolSeeds.filter((tool) => !SLUGS.includes(tool.slug as (typeof SLUGS)[number])).map((tool) => tool.category))
    const categories: Record<(typeof SLUGS)[number], string> = {
      'rankspot': 'SEO',
      'coral-gateway': 'Agent builder',
      'superhands': 'Design',
      'zeus-agent': 'Coding assistant',
      'haris': 'Chat assistant',
      'wiyomi': 'Video editing',
      'vezapi': 'Development',
      'motionrepo': 'AI video',
      'fonazo': 'Agent builder',
      'novatoken': 'Development',
      'artie': 'Agent builder',
      'link-bio': 'Site builder',
      'recall-agents-api': 'Agent builder',
      'arvak': 'Site builder',
      'faros-desktop': 'Development',
      'oll-e': 'Productivity',
      'ollav': 'Design',
      'contactai-desk': 'Productivity',
      'chat-cx': 'Chat assistant',
      'simular-box': 'Automation',
      'pizza-agent': 'Agent builder',
      'eqvesta': 'Automation',
      'longformly': 'AI video',
      'vinc': 'AI video',
      'glass-page': 'Productivity',
      'ballet': 'Automation',
      'keybrum': 'Development',
      'design-lounge': 'Design',
      'elco-console': 'Agent builder',
      'human-in-circuit': 'Automation',
      'delightful-click': 'Design',
      'nova-creative': 'Design',
      'coderbaba': 'Coding assistant',
      'nasiko': 'Agent builder',
      'quiksignal': 'Research',
      'cloudish': 'Development',
      'inbox-hero': 'Productivity',
      'acta-ai': 'Meetings',
      'scatter-study': 'Productivity',
      'oraculum': 'Research',
      'darkcrate': 'Productivity',
      'arcroom': 'Agent builder',
      'askprobe': 'Research',
      'goaltree': 'Productivity',
      'uagents8': 'Agent builder',
      'ivibe': 'Vibe coding',
      'text-to-cad-studio': 'Design',
      'skillsmcp': 'Agent builder',
      'mightywatcher': 'Automation',
      'nestdaddy': 'Development',
      'turbogen': 'AI video',
      'securethread': 'Productivity',
      'backplane': 'Development',
      'circles-whatsapp': 'Chat assistant',
      'marsell': 'Automation',
      'ivycraft': 'Design',
      'hako': 'Coding assistant',
      'base-studio': 'Design',
      'archseed': 'Development',
      'speakapp': 'Voice',
      'narwal': 'Development',
      'storewalk': 'Automation',
      'blushadow': 'Productivity',
      'next3d': 'Design',
      'codela': 'Coding assistant',
      'deeepspace': 'Design',
      'tallbell': 'Voice',
      'versine': 'Automation',
      'superlog': 'Development',
      'lasso-mac': 'Productivity',
      'wispos': 'Game development',
      'trading-agents': 'Research',
      'sondia': 'Voice',
      'kira-id': 'Chat assistant',
      'syniru': 'Productivity',
      'semdex': 'Research',
      'wakel': 'Productivity',
      'senaste': 'Research',
      'buzzmark': 'Automation',
      'unmerge': 'Images',
      'thebold': 'Productivity',
      'pinecall': 'Agent builder',
      'strokes': 'Writing',
      'vigilbase-os': 'Automation',
      'habakkuk': 'Agent builder',
      'dravik': 'SEO',
      'omnitome': 'Productivity',
      'trial-commander': 'Productivity',
      'crawlito': 'SEO',
      'agent-capability-contract': 'Development',
      'lectio': 'Productivity',
      'interviewengine': 'Voice',
      'designforge': 'App builder',
      'plan-chat': 'Design',
      'wron': 'App builder',
      'retriever-app': 'Productivity',
      'descant': 'Development',
      'boomship': 'Productivity',
      'chalkie': 'Research',
      'hexta-ai': 'Agent builder',
      'greenci': 'Development',
      'ringzee': 'Voice',
      'youxr': 'Design',
      'al-narjis-ai': 'Automation',
      'orama-lake': 'Agent builder',
      'astral-homeschool': 'Research',
      'attest-agents': 'Development',
      'botora': 'Chat assistant',
      'aidealy': 'Development',
      'talknative': 'Voice',
      'clamor': 'Productivity',
      'gatherhq-agent-research': 'Research',
      'ai-visibility-by-trulata': 'SEO',
      'infaiw': 'Agent builder',
      'hotline-computer': 'Development',
      'deep-agnt': 'Development',
      'dearinside': 'Chat assistant',
      'reachpilot': 'Automation',
      'cadreen-model-training': 'Development',
      'precedent-ai': 'Images',
      'engine7': 'Chat assistant',
      'apertrue-witness': 'Meetings',
      'corpfinai': 'Productivity',
      'kino-ai': 'AI video',
      'mova': 'Productivity',
    }
    for (const slug of SLUGS) {
      expect(seed(slug).category, slug).toBe(categories[slug])
      expect(existing.has(seed(slug).category), slug).toBe(true)
      expect(['Security', 'Sales', 'Marketing', 'Finance', 'Education'], slug).not.toContain(seed(slug).category)
    }
  })

  it('stores only prices the scout could verify, and leaves unknowns unknown', () => {
    const priced: Record<(typeof SLUGS)[number], { pricingModel: string; priceFromUsd: number | null; hasFreeTier: boolean; label: string }> = {
      'rankspot': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Top-ups from $10' },
      'coral-gateway': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'superhands': { pricingModel: 'freemium', priceFromUsd: 29, hasFreeTier: true, label: 'Free tier, then $29 and up' },
      'zeus-agent': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'haris': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'wiyomi': { pricingModel: 'paid', priceFromUsd: 30, hasFreeTier: false, label: '$30 and up' },
      'vezapi': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$5 for 450 credits' },
      'motionrepo': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      'fonazo': { pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true, label: 'Free tier, then $49 and up' },
      'novatoken': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Credit packs from $5' },
      'artie': { pricingModel: 'freemium', priceFromUsd: 100, hasFreeTier: true, label: 'Free tier, then $100 and up' },
      'link-bio': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free; Pro billing not open yet' },
      'recall-agents-api': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$0.50 per hour' },
      'arvak': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier; paid plan not open yet' },
      'faros-desktop': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'oll-e': { pricingModel: 'freemium', priceFromUsd: 19.99, hasFreeTier: true, label: 'Free tier, then $19.99 and up' },
      'ollav': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'contactai-desk': { pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true, label: 'Free tier, then $5 and up' },
      'chat-cx': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'simular-box': { pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false, label: '$19 and up' },
      'pizza-agent': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'eqvesta': { pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false, label: '$99 and up' },
      'longformly': { pricingModel: 'paid', priceFromUsd: 26, hasFreeTier: false, label: '$26 and up' },
      'vinc': { pricingModel: 'paid', priceFromUsd: 10, hasFreeTier: false, label: '$10 and up' },
      'glass-page': { pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true, label: 'Free tier, then $5 and up' },
      'ballet': { pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false, label: '$25 and up' },
      'keybrum': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      'design-lounge': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'elco-console': { pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false, label: '$99 and up' },
      'human-in-circuit': { pricingModel: 'freemium', priceFromUsd: 5, hasFreeTier: true, label: 'Free tier, then $5 and up' },
      'delightful-click': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'nova-creative': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$2.50 for 500 credits' },
      'coderbaba': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'nasiko': { pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true, label: 'Free tier, then $20 and up' },
      'quiksignal': { pricingModel: 'paid', priceFromUsd: 20, hasFreeTier: false, label: '$20 and up' },
      'cloudish': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Credit packs from $10' },
      'inbox-hero': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during beta; later prices not finalized' },
      'acta-ai': { pricingModel: 'paid', priceFromUsd: 8, hasFreeTier: false, label: '$8 and up' },
      'scatter-study': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'oraculum': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during early access; premium price not published' },
      'darkcrate': { pricingModel: 'paid', priceFromUsd: 79, hasFreeTier: false, label: '$79 and up' },
      'arcroom': { pricingModel: 'freemium', priceFromUsd: 8, hasFreeTier: true, label: 'Free tier, then $8 and up' },
      'askprobe': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'goaltree': { pricingModel: 'freemium', priceFromUsd: 12.99, hasFreeTier: true, label: 'Free tier, then $12.99 and up' },
      'uagents8': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      'ivibe': { pricingModel: 'freemium', priceFromUsd: 8, hasFreeTier: true, label: 'Free tier, then $8 and up' },
      'text-to-cad-studio': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'skillsmcp': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'mightywatcher': { pricingModel: 'paid', priceFromUsd: 8, hasFreeTier: false, label: '$8 and up' },
      'nestdaddy': { pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true, label: 'Free tier, then $19 and up' },
      'turbogen': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$9.99 for 1,000 credits' },
      'securethread': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'backplane': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'circles-whatsapp': { pricingModel: 'paid', priceFromUsd: 14.9, hasFreeTier: false, label: '$14.90 and up' },
      'marsell': { pricingModel: 'paid', priceFromUsd: 49, hasFreeTier: false, label: '$49 and up' },
      'ivycraft': { pricingModel: 'freemium', priceFromUsd: 10, hasFreeTier: true, label: 'Free tier, then $10 and up' },
      'hako': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'base-studio': { pricingModel: 'freemium', priceFromUsd: 20, hasFreeTier: true, label: 'Free tier, then $20 and up' },
      'archseed': { pricingModel: 'freemium', priceFromUsd: 12, hasFreeTier: true, label: 'Free tier, then $12 and up' },
      'speakapp': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'narwal': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free to install; $0.10 per thousand words' },
      'storewalk': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'blushadow': { pricingModel: 'freemium', priceFromUsd: 19, hasFreeTier: true, label: 'Free tier, then $19 and up' },
      'next3d': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$4.90 for a Tryout pack' },
      'codela': { pricingModel: 'freemium', priceFromUsd: 7.99, hasFreeTier: true, label: 'Free tier, then $7.99 and up' },
      'deeepspace': { pricingModel: 'paid', priceFromUsd: 19.99, hasFreeTier: false, label: '$19.99 and up' },
      'tallbell': { pricingModel: 'paid', priceFromUsd: 149, hasFreeTier: false, label: '$149 and up' },
      'versine': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'superlog': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'lasso-mac': { pricingModel: 'paid', priceFromUsd: 9.99, hasFreeTier: false, label: '$9.99 and up' },
      'wispos': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free; paid app store not open yet' },
      'trading-agents': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'sondia': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'kira-id': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      'syniru': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during public beta until January 11, 2027' },
      'semdex': { pricingModel: 'freemium', priceFromUsd: 3.19, hasFreeTier: true, label: 'Free tier, then $3.19 and up' },
      'wakel': { pricingModel: 'paid', priceFromUsd: 25, hasFreeTier: false, label: '$25 and up' },
      'senaste': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$19 for 30 credits' },
      'buzzmark': { pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false, label: '$29 and up' },
      'unmerge': { pricingModel: 'paid', priceFromUsd: 21, hasFreeTier: false, label: '$21 and up' },
      'thebold': { pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false, label: '$19 and up' },
      'pinecall': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'strokes': { pricingModel: 'freemium', priceFromUsd: 9, hasFreeTier: true, label: 'Free tier, then $9 and up' },
      'vigilbase-os': { pricingModel: 'freemium', priceFromUsd: 500, hasFreeTier: true, label: 'Free tier, then $500 and up' },
      'habakkuk': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free to self-host; cloud plan not open yet' },
      'dravik': { pricingModel: 'paid', priceFromUsd: 99, hasFreeTier: false, label: '$99 and up' },
      'omnitome': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'trial-commander': { pricingModel: 'freemium', priceFromUsd: 49, hasFreeTier: true, label: 'Free tier, then $49 and up' },
      'crawlito': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '$300 per site audit' },
      'agent-capability-contract': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'lectio': { pricingModel: 'freemium', priceFromUsd: 6.99, hasFreeTier: true, label: 'Free tier, then $6.99 and up' },
      'interviewengine': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: '₹100 per completed interview' },
      'designforge': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'plan-chat': { pricingModel: 'paid', priceFromUsd: 12, hasFreeTier: false, label: '$12 and up' },
      'wron': { pricingModel: 'paid', priceFromUsd: 4.99, hasFreeTier: false, label: '$4.99/mo and up, billed annually' },
      'retriever-app': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'descant': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Credits from $5' },
      'boomship': { pricingModel: 'freemium', priceFromUsd: 14, hasFreeTier: true, label: 'Free tier, then $14 and up' },
      'chalkie': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'hexta-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'greenci': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during public beta; paid price not published' },
      'ringzee': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'youxr': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during beta; paid plans not available yet' },
      'al-narjis-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Paid' },
      'orama-lake': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'astral-homeschool': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'attest-agents': { pricingModel: 'free', priceFromUsd: null, hasFreeTier: true, label: 'Free' },
      'botora': { pricingModel: 'paid', priceFromUsd: 29, hasFreeTier: false, label: '$29 and up' },
      'aidealy': { pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false, label: '$19 and up' },
      'talknative': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier; from $3 for 10 call minutes' },
      'clamor': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'gatherhq-agent-research': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during early access; paid plans not published' },
      'ai-visibility-by-trulata': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'infaiw': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'hotline-computer': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'deep-agnt': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'dearinside': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during soft open; paid price not published' },
      'reachpilot': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'cadreen-model-training': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'precedent-ai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'engine7': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'apertrue-witness': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free during the pilot; paid plan prices not published' },
      'corpfinai': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
      'kino-ai': { pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true, label: 'Free tier, paid plans available' },
      'mova': { pricingModel: 'paid', priceFromUsd: null, hasFreeTier: false, label: 'Pricing not published' },
    }
    const platforms: Record<(typeof SLUGS)[number], string[]> = {
      'rankspot': ['Web'],
      'coral-gateway': ['Self-hosted'],
      'superhands': ['Web'],
      'zeus-agent': ['Linux'],
      'haris': ['Windows'],
      'wiyomi': ['Windows', 'macOS'],
      'vezapi': ['Web'],
      'motionrepo': ['Web'],
      'fonazo': ['Web'],
      'novatoken': ['Web'],
      'artie': ['Web'],
      'link-bio': ['Web'],
      'recall-agents-api': ['Web'],
      'arvak': ['Web'],
      'faros-desktop': ['macOS'],
      'oll-e': ['iOS'],
      'ollav': ['Web'],
      'contactai-desk': ['Web'],
      'chat-cx': ['Chrome'],
      'simular-box': ['Web'],
      'pizza-agent': ['macOS', 'Windows', 'Linux'],
      'eqvesta': ['Web'],
      'longformly': ['Web'],
      'vinc': ['Web'],
      'glass-page': ['Web'],
      'ballet': ['Web'],
      'keybrum': ['Web'],
      'design-lounge': ['Web'],
      'elco-console': ['macOS'],
      'human-in-circuit': ['Web'],
      'delightful-click': ['Web'],
      'nova-creative': ['Web'],
      'coderbaba': ['Terminal'],
      'nasiko': ['Web'],
      'quiksignal': ['Web'],
      'cloudish': ['Web'],
      'inbox-hero': ['Web'],
      'acta-ai': ['Chrome'],
      'scatter-study': ['Web'],
      'oraculum': ['Web'],
      'darkcrate': [],
      'arcroom': ['Web'],
      'askprobe': ['Web'],
      'goaltree': ['Web'],
      'uagents8': ['Web'],
      'ivibe': [],
      'text-to-cad-studio': [],
      'skillsmcp': ['Web'],
      'mightywatcher': ['Web'],
      'nestdaddy': ['Web'],
      'turbogen': ['Web'],
      'securethread': ['Web'],
      'backplane': ['macOS'],
      'circles-whatsapp': [],
      'marsell': ['Web'],
      'ivycraft': ['Web'],
      'hako': ['iOS', 'macOS'],
      'base-studio': ['Web'],
      'archseed': ['Terminal'],
      'speakapp': ['Windows', 'macOS'],
      'narwal': ['Chrome'],
      'storewalk': ['Web'],
      'blushadow': ['Web'],
      'next3d': ['Web'],
      'codela': ['Web'],
      'deeepspace': ['Web'],
      'tallbell': [],
      'versine': ['Web'],
      'superlog': ['Web'],
      'lasso-mac': ['macOS'],
      'wispos': ['macOS', 'Windows', 'iOS', 'Android'],
      'trading-agents': ['Web'],
      'sondia': ['iOS'],
      'kira-id': ['Web'],
      'syniru': ['Windows', 'Web'],
      'semdex': ['Web'],
      'wakel': ['macOS'],
      'senaste': ['Web'],
      'buzzmark': ['Web'],
      'unmerge': ['Web'],
      'thebold': ['Web'],
      'pinecall': [],
      'strokes': [],
      'vigilbase-os': ['Web'],
      'habakkuk': ['Self-hosted'],
      'dravik': ['Web'],
      'omnitome': [],
      'trial-commander': ['Web'],
      'crawlito': ['Web'],
      'agent-capability-contract': [],
      'lectio': ['iOS', 'Android', 'Windows', 'macOS'],
      'interviewengine': ['Web'],
      'designforge': ['Web'],
      'plan-chat': ['Web'],
      'wron': ['Web'],
      'retriever-app': ['Android'],
      'descant': ['Web'],
      'boomship': ['Web'],
      'chalkie': [],
      'hexta-ai': ['Web'],
      'greenci': ['Web'],
      'ringzee': ['Web'],
      'youxr': ['Web'],
      'al-narjis-ai': ['Web'],
      'orama-lake': ['Self-hosted'],
      'astral-homeschool': ['Web'],
      'attest-agents': [],
      'botora': ['Web'],
      'aidealy': ['Web'],
      'talknative': ['Web'],
      'clamor': ['Web'],
      'gatherhq-agent-research': ['Web'],
      'ai-visibility-by-trulata': ['Web'],
      'infaiw': ['macOS', 'Linux'],
      'hotline-computer': ['Linux'],
      'deep-agnt': ['Web'],
      'dearinside': ['Web'],
      'reachpilot': ['Web'],
      'cadreen-model-training': ['Web'],
      'precedent-ai': ['Web'],
      'engine7': ['Self-hosted'],
      'apertrue-witness': [],
      'corpfinai': ['Web'],
      'kino-ai': ['macOS', 'Windows', 'Linux'],
      'mova': ['Web'],
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
    expect(seed('wron').longDesc).toContain('billed annually')
    expect(seed('keybrum').longDesc).toContain('€29')
    expect(seed('keybrum').longDesc).not.toMatch(/\$\d/)
    expect(seed('speakapp').longDesc).toContain('€4')
    expect(seed('speakapp').longDesc).not.toMatch(/\$\d/)
    expect(seed('ollav').longDesc).toContain('€12')
    expect(seed('ollav').longDesc).not.toMatch(/\$\d/)
    expect(seed('uagents8').longDesc).toContain('€19')
    expect(seed('uagents8').longDesc).not.toMatch(/\$\d/)
    expect(seed('skillsmcp').longDesc).toContain('€8')
    expect(seed('skillsmcp').longDesc).not.toMatch(/\$\d/)
    expect(seed('motionrepo').longDesc).toContain('₹3,199')
    expect(seed('motionrepo').longDesc).not.toMatch(/\$\d/)
    expect(seed('securethread').longDesc).toContain('₹4,999')
    expect(seed('securethread').longDesc).not.toMatch(/\$\d/)
    expect(seed('interviewengine').longDesc).toContain('₹100')
    expect(seed('interviewengine').longDesc).not.toMatch(/\$\d/)
    expect(seed('chalkie').longDesc).toContain('₹399')
    expect(seed('chalkie').longDesc).not.toMatch(/\$\d/)
    expect(seed('kira-id').longDesc).toContain('Rp 299.000')
    expect(seed('kira-id').longDesc).not.toMatch(/\$\d/)
    expect(seed('al-narjis-ai').longDesc).toContain('790 riyals')
    expect(seed('al-narjis-ai').longDesc).not.toMatch(/\$\d/)
    expect(seed('askprobe').longDesc).toContain('£25')
    expect(seed('askprobe').longDesc).not.toMatch(/\$\d/)
    expect(seed('apertrue-witness').longDesc).toContain('£0')
    expect(seed('apertrue-witness').longDesc).not.toMatch(/\$\d/)
    expect(seed('arvak').longDesc).toContain('349 Turkish lira')
    expect(seed('arvak').longDesc).toContain('$9')
    expect(seed('arvak').priceFromUsd).toBeNull()
    expect(seed('mova').longDesc).toContain('€39.99')
    expect(seed('mova').longDesc).not.toMatch(/\$\d/)
    expect(seed('hako').longDesc).toContain('not published')
    expect(seed('acta-ai').longDesc).toContain('₹699')
    expect(seed('acta-ai').priceFromUsd).toBe(8)
  })

  it('does not store public vendor offers as reader deals', () => {
    for (const slug of SLUGS) {
      const tool = seed(slug)
      const copy = `${tool.shortDesc} ${tool.longDesc}`
      expect(copy, slug).not.toMatch(/exclusive|reader deal|member code|BestBotFor code/i)
      expect(tool.fits, slug).toEqual([])
    }
    expect(seed('nestdaddy').longDesc).toContain('No promo code is stored')
    expect(seed('rankspot').longDesc).not.toMatch(/\/go\//)
    expect(seed('zeus-agent').longDesc).toContain('No paid plan was found')
    expect(seed('hako').longDesc).toContain('No free plan is recorded')
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
    const scoutBlock = catalog.slice(catalog.indexOf('Bot scout 2026-11-17'))
    expect(scoutBlock).not.toContain('affiliateUrl')
    expect(scoutBlock).not.toContain('camp_id')
    expect(scoutBlock).not.toContain('rel="sponsored"')
    expect(scoutBlock).not.toMatch(/status: 'active'/)
    expect(scoutBlock).not.toMatch(/\?ref=|\?via=|utm_/)
    expect(scoutBlock).toContain('SCOUTED_2026_11_17')
    expect(scoutBlock).not.toContain('PH50')
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
