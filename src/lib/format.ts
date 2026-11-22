import { N8N_PRICE_LABEL } from '@/data/catalog-corrections'
import { isAnnualBilledSlug, withAnnualBilling } from './annual-billed'
import type { Budget, Skill } from './validation'

const PRICE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  n8n: N8N_PRICE_LABEL,
  // writesonic.com/pricing, Oct 21, 2026: no free plan; 7-day trial needs no card.
  writesonic: 'Free trial, no card; then $79 and up',
  // hyperresearch.ai/pricing, Nov 3, 2026: Light $9 and Deep $49 are per run, not a monthly plan.
  hyperresearch: '$9 per run and up',
  // mcp1.com, Nov 10, 2026: no price was readable on the product site. Unverified third-party figures are not stored.
  mcp1: 'Pricing not published',
  // voyager.fm, Nov 10, 2026: Free is available. Plus and Pro are listed and are not available yet, so they are not a from-price.
  'voyager-fm': 'Free; Plus and Pro not available yet',
  // seldon.com/products/wren, Nov 11, 2026: $3 is per completed test run, not a monthly plan. The first 10 runs are free.
  'seldon-wren': '10 free runs, then $3 per completed test run',
  // valin.ai, Nov 12, 2026: free TestFlight beta. No price is published, so none is stored.
  valin: 'Pricing not published',
  // offstage.cloud, Nov 13, 2026: $1.10/hour billed by the second. Not a monthly plan. The $5 credit is a one-time trial.
  'offstage-cloud': '$1.10 per hour',
  // insight7.io, Nov 13, 2026: voice-agent pricing is not published. Call-analytics tiers are a different product.
  'insight7-voice-agents': 'Pricing not published',
  // render.com/sandboxes, Nov 13, 2026: public beta. No sandbox-specific price is published.
  'render-sandboxes': 'Pricing not published',
  // willocompanion.com, Nov 13, 2026: 50 answers a day are free. Paid plans are listed and are not open yet.
  willo: 'Free to start; paid plans not open yet',
  // 49agents.com/qorqbot, Nov 13, 2026: personal use is free. The commercial license is free until 2027, then $10/mo billed annually.
  qorqbot: 'Free; commercial license $10/mo billed annually from 2027',
  // talkify.cc, Nov 14, 2026: one plan at $32 a year. That is a yearly total, not a monthly rate, so it is not stored as priceFromUsd.
  talkify: '$32 a year',
  // tesseract.dev, Nov 15, 2026: the app is free. Pay-as-you-go top-ups start at $10. That is not a monthly plan.
  'tesseract-eightcell': 'Free tier; top-ups from $10',
  // tacie.app, Nov 15, 2026: free beta. A later subscription is planned and its price is not published.
  tacie: 'Free during beta; subscription price not published',
  // mindwiki.io, Nov 15, 2026: Pro is $200 a year. That is a yearly total, not a monthly rate. The Power plan price is not published.
  mindwiki: 'Free tier, then $200 a year',
  // makethemcode.com, Nov 15, 2026: input is $1 per 1M tokens. That is not a monthly plan.
  makethemcode: '$1 per 1M input tokens',
  // constor.ai, Nov 15, 2026: demo-led. No price is published.
  constor: 'Pricing not published',
  // trydori.io, Nov 15, 2026: the pricing page requires sign-in. No price is published.
  dori: 'Pricing not published',
  // open.bot, Nov 16, 2026: personal use is free. Business is up to $29 per active user a month, and the rate falls as the team grows, so $29 is a cap and not a from-price.
  openbot: 'Free for personal use; business up to $29 a user',
  // celesto.ai, Nov 16, 2026: sandbox runtime is billed by the hour. There is no monthly platform fee.
  celesto: '$0.015 per hour',
  // lingomic.com, Nov 16, 2026: the current 6-month plan is $29 every 6 months. That is not a monthly plan.
  lingomic: '$29 every 6 months',
  // flamigo.ai, Nov 16, 2026: credits are bought once. The smallest pack is $2 for 2,000,000 credits. That is not a monthly plan.
  flamigo: '$2 for 2,000,000 credits',
  // farsideresearch.com, Nov 16, 2026: research credits are packs. The smallest pack is $15 for 500 credits. That is not a monthly plan.
  'farside-research': '$15 for 500 credits',
  // syrev.ai, Nov 16, 2026: a review is priced per review. Academic Replay is $149. That is not a monthly plan.
  syrev: '$149 per academic review',
  // lexicad.com, Nov 16, 2026: compute is billed by the core-hour. No rate is published.
  lexicad: 'Pricing not published',
  // dimensionkit.com, Nov 16, 2026: Starter is free during open beta. The planned $19/mo price is not charged yet.
  dimensionkit: 'Free during open beta; Starter planned at $19/mo',
  // readywhen.ai, Nov 16, 2026: no price is published.
  readywhen: 'Pricing not published',
  // simpleton.io, Nov 16, 2026: no price is published.
  simpleton: 'Pricing not published',
  // perit.ai/marketplace, Nov 16, 2026: pricing is a quote. No price is published.
  'perit-marketplace': 'Pricing not published',
  // brainmate.dev, Nov 16, 2026: pilot only. No price is published.
  brainmate: 'Pricing not published',
  // pammy.ai, Nov 16, 2026: no price is published.
  pammy: 'Pricing not published',
  // moonbird.tv, Nov 16, 2026: no price is published.
  moonbird: 'Pricing not published',
  // bot scout 2026-11-17. Non-monthly prices, unpublished prices, and prices that are not charged yet.
  'rankspot': 'Top-ups from $10',
  'vezapi': '$5 for 450 credits',
  'novatoken': 'Credit packs from $5',
  'link-bio': 'Free; Pro billing not open yet',
  'recall-agents-api': '$0.50 per hour',
  'arvak': 'Free tier; paid plan not open yet',
  'nova-creative': '$2.50 for 500 credits',
  'cloudish': 'Credit packs from $10',
  'inbox-hero': 'Free during beta; later prices not finalized',
  'oraculum': 'Free during early access; premium price not published',
  'turbogen': '$9.99 for 1,000 credits',
  'hako': 'Pricing not published',
  'narwal': 'Free to install; $0.10 per thousand words',
  'next3d': '$4.90 for a Tryout pack',
  'versine': 'Pricing not published',
  'superlog': 'Pricing not published',
  'wispos': 'Free; paid app store not open yet',
  'trading-agents': 'Pricing not published',
  'syniru': 'Free during public beta until January 11, 2027',
  'senaste': '$19 for 30 credits',
  'pinecall': 'Pricing not published',
  'habakkuk': 'Free to self-host; cloud plan not open yet',
  'crawlito': '$300 per site audit',
  'interviewengine': '₹100 per completed interview',
  'retriever-app': 'Pricing not published',
  'descant': 'Credits from $5',
  'hexta-ai': 'Pricing not published',
  'greenci': 'Free during public beta; paid price not published',
  'ringzee': 'Pricing not published',
  'youxr': 'Free during beta; paid plans not available yet',
  'astral-homeschool': 'Pricing not published',
  'talknative': 'Free tier; from $3 for 10 call minutes',
  'clamor': 'Pricing not published',
  'gatherhq-agent-research': 'Free during early access; paid plans not published',
  'ai-visibility-by-trulata': 'Pricing not published',
  'infaiw': 'Pricing not published',
  'hotline-computer': 'Pricing not published',
  'deep-agnt': 'Pricing not published',
  'dearinside': 'Free during soft open; paid price not published',
  'reachpilot': 'Pricing not published',
  'cadreen-model-training': 'Pricing not published',
  'precedent-ai': 'Pricing not published',
  'engine7': 'Pricing not published',
  'apertrue-witness': 'Free during the pilot; paid plan prices not published',
  'corpfinai': 'Pricing not published',
  mova: 'Pricing not published',
  // bot scout 2026-11-18. Non-monthly prices, unpublished prices, non-dollar prices, and prices that are not charged yet.
  'textend': 'Free tier, then $29.99 once',
  'machinence': '£99 a month',
  'novatek-book-publishing': '$179 per book',
  'text-to-gif': '$10 for 440 credits',
  'letterslot': 'Free tier, then €24 once',
  'helpwing': '$6 for 60 minutes',
  'storybook-ai': 'Free to try; plan prices not published',
  'face-shape-haircut-ai': 'From $9.99; billing period not stated',
  'crosshead': 'Free tier; $1 for 1,000 credits',
  'spokendocs': 'Free tier, then €79 once',
  'college-essay-grader': 'Free tier, then $4.99 per essay',
  'editedimage': 'Free tier; paid packs not on sale',
  'hostbloom': '$1.20 for 5 credits',
  'nutri-ai': '₹399 a month',
  'truinttrip': 'Free tier, then $79 a year',
  'search2o': 'Free; paid cloud not open yet',
  'confidential-ai-cloud': '$68 per hour',
  'voplica-studio': 'Pricing not published',
  'yakafa': '€9 a month',
  'mixos': 'Pricing not published',
  'warmprose': 'Free checks; full rewrite price not published',
  'soreqen-code': 'Pricing not published',
  'kadeep-ai': 'Pricing not published',
  'firsttake': '$9 once',
  'verspa': '£999 a month',
  'lally-ai': 'Free tier, then ₹6,999 a month',
  'agentready-mcp': 'Free during beta; token rates are not a monthly plan',
  'vocelle': 'Pricing not published',
  'caughtthemagic': 'Free preview, then $3.49 for 5 credits',
  'qpilot': 'Pricing not published',
  'vanira': 'Pricing not published',
  'urun': 'Pricing not published',
  'modern-computer': 'Pricing not published',
  'my-professional-headshot': '$9.90 for 3 credits',
  'pablit': 'Pricing not published',
  'solipsist': 'Pricing not published',
  'tutorbee': 'Pricing not published',
  'debo-ai': 'Free to start; paid plans not set yet',
  'dynos-work': 'Pricing not published',
  'basellm': 'Pricing not published',
  'archon-ai': 'Pricing not published',
  'opstether': 'Free during beta; paid price not published',
  'rising-tide-digital': 'Free snapshot; full audit price not published',
  'niveau7': 'Pricing not published',
  'tokenguard-os': 'Pricing not published',
  'streaker-app': 'Pricing not published',
  'agav': 'Pricing not published',
  'solarian': 'Pricing not published',
  'r3-hyperlogue': 'Pricing not published',
  'yantra-app': 'Pricing not published',
  'ai-spar': 'Pricing not published',
  'bysicle': 'Pricing not published',
  'docdost-ai': 'Pricing not published',
  // bot scout 2026-11-21. Non-monthly prices, unpublished prices, non-dollar prices, and prices that are not charged yet.
  'explorbot': '$1 an hour for model tokens',
  'gridline-gpu': 'Credits from $5',
  'ade': 'Free tier, then from $0.01 an hour',
  'identitas': 'Free scan, then $9 a project',
  'simple-unmark': 'Free tier, then $5 for credits',
  'quizwhiz': 'Free tier, then $29 once',
  'ai-call': 'Usage priced; a phone number is $5 a month',
  'maglev': 'Pay per call from a prepaid balance',
  'fecto': 'Free check; growth share capped at $100 a month',
  'zuse': 'From $0.12 per 1M input tokens',
  'what-brandon-thinks': 'Free preview, then $9.99 for a report',
  'duly-invoicing': '$49 once',
  'railcall': 'Free on your machine; credits from $10',
  'cerebellum-cloud': 'From $0.25 per 1M tokens',
  'ai-rap-forge': '$9 for 500 credits',
  'ai-manga-translator': '$4.99 for a credit pack',
  'rasvu': '€49 a month',
  'narrascout': 'Free tier; paid plans not available yet',
  'custom-song-gift': '$9.90 for one song',
  'vigil': 'Free tier, then $4,990 a year',
  'interview-ai-assistant': 'Free to self-host; hosted tips from $5',
  'jinglelark': '$14.90 for 50 credits',
  'partnerme-ai': 'Free tier, then £5.99 a month',
  'flur-commerce': 'Pricing not published',
  'orchestraml': 'Free tier, then ₹1,499 a month',
  'upreap-equity': 'Free tier, then Rs 299 a month',
  'source-attribution': 'Free tier; $2 per 100,000 stored events',
  'badya': 'Free coins, then $4.99 for 200 coins',
  'rage-bait': 'Free to download, then $1.99 for minutes',
  'sourceseo': '$997 every 4 weeks',
  'whatsales': '£199 a month',
  'elixiary-ai': 'Free tier, then €5.49 a month',
  'glot-translate': 'Free during beta; paid plans not set yet',
  'clipinai': 'Free tier, then ₹199 a month',
  'relic-ai': 'Free during beta; paid price not published',
  'project-m': 'Pricing not published',
  'opttab': '€33 a month',
  'reprowise': 'Pricing not published',
  'interview-coach': 'Pricing not published',
  'zethos': 'Free until December 3, 2026',
  'croon': 'Free, then from $7.99; billing period not stated',
  'oodle-ai': 'Pricing not published',
  'wana-labs': '€25 a month',
  'visibilityos': '$6,999 every 6 months',
  'vaprix-ai': '$149 per web application',
  'gateweave': 'No Gateweave price; Cloudflare Workers Paid is $5 a month',
  'skinify': 'Free tier, then $4.99 a week',
  'skanna': 'Free tier, then €2.99 a month',
  'opencomputer': 'Free to self-host; cloud price not published',
  'voxnotes-ai': 'Pricing not published',
  'daksha': 'Free to start; paid plans not published',
  'purple-flow': 'Pricing not published',
  'runetranslate': 'Pricing not published',
  'conversaflex': 'Pricing not published',
  'columns-ai': 'Pricing not published',
  'ayk-maps': 'Pricing not published',
  'clutterbuster': 'Free to start; paid price not published',
  'querynza': 'Pricing not published',
  'agentproof': '$490 for a 2-week pilot',
  'ezvoice-ai': 'Pricing not published',
  'ofintech-desk': 'Pricing not published',
  'ai-gateway': 'Pricing not published',
  'groundwork': 'Pricing not published',
  'tinytldr': 'Pricing not published',
  'mailpipe': 'Pricing not published',
  'mesh-api': 'Pricing not published',
  'anya-imai': 'Pricing not published',
  'nav-vera': 'Pricing not published',
  'esgenix': 'Pricing not published',
  'manwe': 'Pricing not published',
  'compagnion': 'Pricing not published',
  'ankhet': '$150 per completed session',
  'pictowalk': '$9 a walk',
  'faceless-kit': '$39 once',
  'skv-network': 'Pricing not published',
  'starbright': 'Pricing not published',
  'fizzler': 'Pricing not published',
  'cyravo-securebuild-ai': 'Pricing not published',
  'disposable': 'Pricing not published',
  'intrusive-ai': 'Pricing not published',
  'redcat': 'Pricing not published',
  'ilion-v5-public-lab': 'Pricing not published',
  'shhots-ai-for-ios': 'Pricing not published',
  // bot scout 2026-11-22. Non-monthly prices, unpublished prices, non-dollar prices, and prices that are not charged yet.
  'nistivo': 'A quote is $25',
  'stellarfirm': 'Free tier, then €19 a month',
  'wonderblok': 'Free tier, then Rp 119.200 a month',
  'your-ai-presence': 'Free check, then €9 once',
  'eazyrender': 'Free preview, then $2 for 2 credits',
  'contentskeeper': 'Free tier, then $9.99 a year',
  'voice-greeting-studio': '$9 per greeting',
  'takecraft': '$4.99 once',
  'cheapest-imagen': 'Credits from $10',
  'fanficwizard': 'Free tier, then $5 for credits',
  'intoslides': 'Free tier, paid plans available',
  'houseexterior': 'Free tools, then $4.99 for 30 designs',
  'removebg-studio': '$12.80 for 80 images',
  'redact-btp': '€49 a month',
  'creatend': 'Free tier, then $20 once',
  'clientforge-ai-os': '$47 once',
  'brydepth': '$9 for 30 days',
  'blogcrew': 'Free during beta, then €31 a month',
  'alyn': 'Pricing not published',
  'sysdesignprep-com': '$49 for 30 days',
  'analyzeit': 'Free tier; paid plan billed in rupees',
  'verix': 'Free tier, then BRL 29,90 a month',
  'hairstyle-changer': '$9.99 once',
  'research-gap-finder': 'Pricing not published',
  'viralguy': 'Pricing not published',
  'metrion': 'Pricing not published',
  'needps': 'Pricing not published',
  'taxsnap-ai': 'Free tier, then £4.99 a month',
  'customermates': 'Free tier, then €12 a month',
  'eevi': '€17.99 a month',
  'asgard-learn': 'Pricing not published',
  'prompt-upgrader': 'Pricing not published',
  'h3-image': '$9.90 for 500 credits',
  'teaserkit': '$49 once',
  'ai-md': 'Pricing not published',
  'ui-ux-workflow-for-claude-code': '$79 once',
  'oqirra': 'Pricing not published',
  'flowood': '$4.99 for 3 credits',
  'mockif': '£39 a month',
  'recus': 'Free during early access',
  'outfitrating': 'Free checks, then $4.99 for 15 checks',
  'talkty': 'Free tier, then ₺2.790 a month',
  'ezytoon': '$2.99 for 50 pages',
  'reviewkind': '₹399 a month',
  'buildcraft-ai': 'Free tier, then ₹99 once',
  'eigen': 'Free tier, paid plans available',
  'keytally': 'Free to start; paid price not published',
  'abrobot': 'Free tier, then ₹999 for 30 days',
  'botforbizz-ai': 'Free tier, paid plans available',
  're-i': 'Free questions; paid price not published',
  'agent-doctor': 'Free to start; paid price not published',
  'memolio': '$14.99 for the PDF',
  'worldfoundry': 'Pricing not published',
  'merrin': 'Free to start; paid price not published',
  'miradge': 'Free guest mode, then ₹3 a day',
  'hesabdar-ai': 'Pricing not published',
  'voyalys': 'Pricing not published',
  'canvaslab-ai-photo-editor': '$0.49 once',
  'aizeum': 'Pricing not published',
  'qoves-ai': '$10 for 100 credits',
  'sitebrain-ai': 'Free preview, then ₹199 a month',
  'mozhi-live-offline-translator': 'Pricing not published',
  'inference-stack': 'Pricing not published',
  'pencil': 'Pricing not published',
  'ai-minecraft-skin-generator': 'Free editor, then $5 for credits',
  'modelflare': 'Pricing not published',
  'tabprune': 'Pricing not published',
  'oscova-agents': 'Pricing not published',
  'easy-lens-cli': 'Pricing not published',
  'zanbots-ai-sdr': 'Pricing not published',
  'photodoc': 'Pricing not published',
  'reelhatch': 'Pricing not published',
  'lynxcatai': 'Free to start; paid price not published',
  'kovax': 'Pricing not published',
  'vesily': 'Pricing not published',
  'burnie-by-geilstekerze': 'Pricing not published',
  'sparda': 'Pricing not published',
  'circuitai': 'Free to start; paid price not published',
  'sodium': 'Pricing not published',
  'makla': 'Pricing not published',
  'diskwarden': 'Free to start; paid price not published',
  'lingonibble': 'Free to start; paid price not published',
  'cattle-ai-weight-herd': 'Pricing not published',
  'holofame': 'Free to download; Premium price not published',
  'virales-ai': 'Pricing not published',
  'weather-report-09-ai': 'Pricing not published',
  'humanai-date': 'Pricing not published',
}

export const budgetLabel: Record<Budget, string> = {
  free: 'Free only',
  low: 'Low cost',
  any: 'Any budget',
}

/** Shown on a shortlisted tool that sits outside the chosen budget. */
export const overBudgetLabel = 'Just over budget'

/** Shown when fewer than six alternatives clear the minimum fit. */
export const fewStrongOptionsLabel = 'Few strong options exist for this yet.'

export const skillLabel: Record<Skill, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  pro: 'Advanced',
}

/** Phrase that already includes the article, so "any" does not become "a any budget budget". */
export function budgetPhrase(budget: Budget): string {
  if (budget === 'free') return 'on a free-only budget'
  if (budget === 'low') return 'on a low-cost budget'
  return 'on any budget'
}

export function skillPhrase(skill: Skill): string {
  const label = skillLabel[skill].toLowerCase()
  const article = /^[aeiou]/.test(label) ? 'an' : 'a'
  return `${article} ${label} user`
}

export function formatUsDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || !month || !day) return isoDate
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

type Priced = {
  slug?: string
  pricingModel: string
  hasFreeTier: boolean
  priceFromUsd: number | null
}

export function priceLabel(tool: Priced): string {
  // The column cannot be empty, so the seed uses "paid" with no dollar amount.
  if (tool.slug === 'modelpeers') return 'Pricing not published'
  if (tool.slug) {
    const override = PRICE_LABEL_OVERRIDES[tool.slug]
    if (override) return withAnnualBilling(tool.slug, override)
  }
  if (tool.pricingModel === 'free') return withAnnualBilling(tool.slug, 'Free')
  if (tool.priceFromUsd != null) {
    const wholeDollars = Number.isInteger(tool.priceFromUsd)
    const money = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: wholeDollars ? 0 : 2,
      maximumFractionDigits: wholeDollars ? 0 : 2,
    }).format(tool.priceFromUsd)
    // "/mo" is only for the annual list. A bare "$1,650 and up, billed annually" reads as a yearly total.
    const amount = isAnnualBilledSlug(tool.slug) ? `${money}/mo` : money
    const label = tool.hasFreeTier ? `Free tier, then ${amount} and up` : `${amount} and up`
    return withAnnualBilling(tool.slug, label)
  }
  if (tool.hasFreeTier) return withAnnualBilling(tool.slug, 'Free tier, paid plans available')
  return withAnnualBilling(tool.slug, 'Paid')
}

export function formatStripeAmount(unitAmount: number, currency: string, interval: string | null): string {
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(unitAmount / 100)
  if (!interval) return money
  const period = interval === 'month' ? 'month' : interval === 'year' ? 'year' : interval
  return `${money} per ${period}`
}
