import type { AffiliateSeed, ToolSeed } from '@/lib/catalog-types'

// BestBotFor follow-up seed: music generators + SEO tools. Prepared 2026-10-16 by Forge.
// Same format as the catalog expansion (allowedHosts is on main as of b070e0f).
// Only tools whose tier and free-plan status were read on the official pricing page on 2026-10-16. Affiliate status: 'verify' (unknown).
// Fit scores sit below the task leaders on main: Suno 95 (music), Surfer 94 (seo). Editorial judgments, not vendor claims.

const REVIEWED = '2026-10-16'

const none: AffiliateSeed = {
  hasProgram: false,
  network: null,
  sourceUrl: null,
  status: 'none',
  commissionNote: null,
}

function tool(entry: ToolSeed): ToolSeed {
  return entry
}

export const musicSeoToolSeeds: ToolSeed[] = [
  // pricing verified 2026-10-16 at https://www.udio.com/pricing | budget fit: free | best for: music,songs,vocals
  tool({
    slug: 'udio',
    name: 'Udio',
    vendor: 'Udio',
    url: 'https://www.udio.com',
    allowedHosts: ['www.udio.com'],
    category: 'Music',
    shortDesc: 'Generate full songs with vocals from a text prompt.',
    longDesc: 'The closest alternative to Suno for prompt-to-song with vocals. The Free plan has a small daily credit quota; paid plans start at $10/mo and add editing, voice control and audio uploads.',
    pricingModel: 'freemium',
    priceFromUsd: 10,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'music', score: 88, notes: 'Prompt-to-song with vocals, close behind Suno.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://www.aiva.ai/pricing | budget fit: free | best for: music,soundtrack,midi,instrumental
  tool({
    slug: 'aiva',
    name: 'AIVA',
    vendor: 'AIVA',
    url: 'https://www.aiva.ai',
    allowedHosts: ['www.aiva.ai'],
    category: 'Music',
    shortDesc: 'An AI composer for instrumental music in 250+ styles, with MIDI export.',
    longDesc: 'Good for soundtracks and background scores you can edit as MIDI. The free plan is non-commercial and requires credit to AIVA; Pro is needed to own the copyright.',
    pricingModel: 'freemium',
    priceFromUsd: null,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web', 'Windows', 'macOS', 'Linux'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'music', score: 78, notes: 'Composes instrumental tracks; no sung vocals like Suno.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://soundraw.io/pricing | budget fit: low | best for: music,background-music,royalty-free,creators
  tool({
    slug: 'soundraw',
    name: 'SOUNDRAW',
    vendor: 'SOUNDRAW',
    url: 'https://soundraw.io',
    allowedHosts: ['soundraw.io'],
    category: 'Music',
    shortDesc: 'Royalty-free AI background music you can customize and download.',
    longDesc: 'Aimed at creators who need licensed background tracks for videos and podcasts. Creator starts at $16.99/mo, and there is no free download plan.',
    pricingModel: 'paid',
    priceFromUsd: 16.99,
    hasFreeTier: false,
    skillLevel: 'beginner',
    platforms: ['Web'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'music', score: 74, notes: 'Generates royalty-free instrumental tracks for content, not full vocal songs.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://mubert.com/render/pricing | budget fit: free | best for: music,background-music,streaming,api
  tool({
    slug: 'mubert',
    name: 'Mubert',
    vendor: 'Mubert',
    url: 'https://mubert.com',
    allowedHosts: ['mubert.com'],
    category: 'Music',
    shortDesc: 'Generate royalty-free background tracks by genre, mood or prompt.',
    longDesc: 'Quick background music for streams, videos and apps, plus an API. The free Ambassador plan is non-commercial with 25 tracks a month. Creator starts at $14/mo.',
    pricingModel: 'freemium',
    priceFromUsd: 14,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web', 'API'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'music', score: 72, notes: 'Background tracks by mood and genre; not a vocal song generator.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://www.clearscope.io/pricing | budget fit: any | best for: seo,content-optimization,briefs,geo
  tool({
    slug: 'clearscope',
    name: 'Clearscope',
    vendor: 'Clearscope',
    url: 'https://www.clearscope.io',
    allowedHosts: ['www.clearscope.io'],
    category: 'SEO',
    shortDesc: 'Content optimization for search and AI answers, with briefs and monitoring.',
    longDesc: 'A polished content-grading tool for teams publishing at volume. It has a 14-day free trial, then paid plans starting at $129/mo.',
    pricingModel: 'paid',
    priceFromUsd: 129,
    hasFreeTier: false,
    skillLevel: 'intermediate',
    platforms: ['Web'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'seo', score: 88, notes: 'Content optimization is the product; pricier than Surfer.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://www.marketmuse.com/pricing/ | budget fit: free | best for: seo,content-strategy,briefs,topic-research
  tool({
    slug: 'marketmuse',
    name: 'MarketMuse',
    vendor: 'MarketMuse',
    url: 'https://www.marketmuse.com',
    allowedHosts: ['www.marketmuse.com'],
    category: 'SEO',
    shortDesc: 'Content planning and briefs based on topic authority.',
    longDesc: 'Best for planning which topics to cover and briefing writers. The Free plan is limited to 10 queries a month for one user.',
    pricingModel: 'freemium',
    priceFromUsd: null,
    hasFreeTier: true,
    skillLevel: 'intermediate',
    platforms: ['Web'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'seo', score: 85, notes: 'Strong content planning; less of a hands-on editor than Surfer.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://neuronwriter.com/pricing-neuron/ | budget fit: low | best for: seo,content-editor,budget,on-page
  tool({
    slug: 'neuronwriter',
    name: 'NEURONwriter',
    vendor: 'NEURONwriter',
    url: 'https://neuronwriter.com',
    allowedHosts: ['neuronwriter.com'],
    category: 'SEO',
    shortDesc: 'An affordable SEO content editor with SERP-based term suggestions.',
    longDesc: 'A budget alternative to Surfer for on-page content scoring. Bronze starts at $23/mo. There is a 7-day free trial on Gold-plan terms, with no permanent free plan.',
    pricingModel: 'paid',
    priceFromUsd: 23,
    hasFreeTier: false,
    skillLevel: 'intermediate',
    platforms: ['Web'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'seo', score: 84, notes: 'Surfer-style content scoring at a lower price.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-26 at https://www.semrush.com/prices/ (SEO $139/mo monthly, $117.33/mo annual; Free 10 reports/day). #143 restored 139.95; this is the carried 10/22 fix. | budget fit: free | best for: seo,keyword-research,rank-tracking,site-audit
  tool({
    slug: 'semrush',
    name: 'Semrush',
    vendor: 'Semrush',
    url: 'https://www.semrush.com',
    allowedHosts: ['www.semrush.com'],
    category: 'SEO',
    shortDesc: 'An all-in-one SEO suite: keywords, rank tracking, audits, and AI visibility.',
    longDesc: 'The broad platform for keyword research, competitors and site audits. A free account includes 1 project and 10 reports a day. Paid SEO plans start at $139/mo billed monthly.',
    pricingModel: 'freemium',
    priceFromUsd: 139,
    hasFreeTier: true,
    skillLevel: 'intermediate',
    platforms: ['Web', 'API'],
    lastVerifiedAt: '2026-10-26',
    fits: [
      { task: 'seo', score: 90, notes: 'Full SEO suite; writing optimization is one part of it.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://ahrefs.com/pricing | budget fit: any | best for: seo,backlinks,keyword-research,site-audit
  tool({
    slug: 'ahrefs',
    name: 'Ahrefs',
    vendor: 'Ahrefs',
    url: 'https://ahrefs.com',
    allowedHosts: ['ahrefs.com'],
    category: 'SEO',
    shortDesc: 'SEO suite known for backlink and keyword data, with a free tier for site owners.',
    longDesc: 'Strong for backlinks, keywords and site audits. Ahrefs Free gives site owners limited Site Explorer and Site Audit; paid plans run from $29 Starter to $449 Advanced.',
    pricingModel: 'freemium',
    priceFromUsd: 29,
    hasFreeTier: true,
    skillLevel: 'intermediate',
    platforms: ['Web', 'API'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'seo', score: 90, notes: 'Best-in-class backlink and keyword data; not a writing editor.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
  // pricing verified 2026-10-16 at https://seranking.com/subscription.html | budget fit: any | best for: seo,rank-tracking,site-audit,agencies
  tool({
    slug: 'se-ranking',
    name: 'SE Ranking',
    vendor: 'SE Ranking',
    url: 'https://seranking.com',
    allowedHosts: ['seranking.com'],
    category: 'SEO',
    shortDesc: 'SEO and GEO platform for rank tracking, audits and AI visibility.',
    longDesc: 'A lower-cost all-in-one SEO suite for small teams and agencies. 14-day free trial, then paid plans from $129/mo.',
    pricingModel: 'paid',
    priceFromUsd: 129,
    hasFreeTier: false,
    skillLevel: 'intermediate',
    platforms: ['Web', 'API'],
    lastVerifiedAt: REVIEWED,
    fits: [
      { task: 'seo', score: 84, notes: 'Solid all-in-one suite at a lower price than Semrush.' },
    ],
    affiliate: { ...none, status: 'verify' },
  }),
]

// Fit-row patch for the existing elevenlabs tool. Official site: Eleven Music (Music v2) at
// https://elevenlabs.io/music. https://elevenlabs.io/pricing lists Music on the Free plan, with
// commercial use from Starter. Applied in src/data/catalog.ts.
export const elevenlabsMusicFit = { task: 'music', score: 86, notes: 'Eleven Music generates songs with vocals; commercial use needs a paid plan.' } as const
