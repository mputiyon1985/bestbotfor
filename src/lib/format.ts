import type { Budget, Skill } from './validation'

export const budgetLabel: Record<Budget, string> = {
  free: 'Free only',
  low: 'Low cost',
  any: 'Any budget',
}

export const skillLabel: Record<Skill, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  pro: 'Advanced',
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
  pricingModel: string
  hasFreeTier: boolean
  priceFromUsd: number | null
}

export function priceLabel(tool: Priced): string {
  if (tool.pricingModel === 'free') return 'Free'
  if (tool.priceFromUsd != null) {
    const money = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(tool.priceFromUsd)
    return tool.hasFreeTier ? `Free tier, then ${money} and up` : `${money} and up`
  }
  if (tool.hasFreeTier) return 'Free tier, paid plans available'
  return 'Paid'
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
