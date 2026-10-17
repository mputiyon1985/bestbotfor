/**
 * Approved sponsor list prices. Checkout never reads these numbers from the
 * browser. It charges the Stripe Price id in the matching env var.
 * scripts/stripe-setup-test.ts creates those Prices in test mode from this list.
 *
 * All three are one-time Prices. Checkout uses mode payment, which cannot
 * charge a recurring Price, so the setup script does not send a recurring
 * interval. A week and a month are a single charge for that placement. The
 * newsletter slot is a single charge for one issue.
 */

export const SPONSOR_CURRENCY = 'usd'

/**
 * Stripe product name and the card statement suffix. Card charges reject
 * statement_descriptor on this API version, so Checkout sends this as
 * statement_descriptor_suffix. 22 characters is the Stripe maximum.
 */
export const SPONSOR_BUSINESS_NAME = 'BestBotFor'

/** Shown beside each sponsor option and on the Checkout pay button. */
export const SPONSOR_ONE_TIME_NOTICE = 'One-time payment, no auto-renewal.'

/**
 * Stable label for this Checkout flow. A retried sponsor form must send the
 * same value, or Stripe rejects the reused idempotency key.
 */
export const SPONSOR_INTEGRATION_IDENTIFIER = 'sponsor_checkout_featured'

export const SPONSOR_OFFERINGS = [
  {
    id: 'placement_weekly',
    lookupKey: 'sponsor_best_placement_weekly',
    priceEnv: 'STRIPE_PRICE_PLACEMENT_WEEKLY',
    unitAmount: 9_900,
    productName: 'Featured placement, one week',
    title: 'Featured placement for one week',
    summary: 'One featured tool slot on a single /best/[task] page for seven days.',
    cadence: 'week',
    target: 'task',
  },
  {
    id: 'placement_monthly',
    lookupKey: 'sponsor_best_placement_monthly',
    priceEnv: 'STRIPE_PRICE_PLACEMENT_MONTHLY',
    unitAmount: 29_900,
    productName: 'Featured placement, one month',
    title: 'Featured placement for one month',
    summary: 'One featured tool slot on a single /best/[task] page for thirty days.',
    cadence: 'month',
    target: 'task',
  },
  {
    id: 'newsletter_slot',
    lookupKey: 'sponsor_newsletter_issue',
    priceEnv: 'STRIPE_PRICE_NEWSLETTER_SLOT',
    unitAmount: 4_900,
    productName: 'Newsletter sponsor slot',
    title: 'Newsletter sponsor slot',
    summary: 'One sponsor mention in a single newsletter issue.',
    cadence: 'issue',
    target: 'issue_date',
  },
] as const

export type SponsorOffering = (typeof SPONSOR_OFFERINGS)[number]
export type SponsorOfferingId = SponsorOffering['id']

export function sponsorOffering(id: string): SponsorOffering | null {
  return SPONSOR_OFFERINGS.find((offering) => offering.id === id) ?? null
}

export function sponsorPriceLabel(unitAmount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(unitAmount / 100)
}

/** Server-side price id. Returns null unless the env value is a Stripe Price id. */
export function sponsorPriceId(offeringId: string, env: Record<string, string | undefined> = process.env): string | null {
  const offering = sponsorOffering(offeringId)
  if (!offering) return null
  const value = env[offering.priceEnv]?.trim() ?? ''
  if (!/^price_[A-Za-z0-9_]+$/.test(value)) return null
  return value
}
