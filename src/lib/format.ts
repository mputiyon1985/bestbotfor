import { N8N_PRICE_LABEL } from '@/data/catalog-corrections'
import { isAnnualBilledSlug, withAnnualBilling } from './annual-billed'
import type { Budget, Skill } from './validation'

const PRICE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  n8n: N8N_PRICE_LABEL,
  // writesonic.com/pricing, Oct 21, 2026: no free plan; 7-day trial needs no card.
  writesonic: 'Free trial, no card; then $79 and up',
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
