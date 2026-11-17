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
  'mova': 'Pricing not published',
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
