/**
 * Approved sponsor list prices. Checkout never reads these numbers from the
 * browser. It charges the Stripe Price id in the matching env var.
 * scripts/stripe-setup-test.ts creates those Prices in test mode from this list.
 *
 * The first three are one-time Prices charged with Checkout mode payment. A
 * week and a month are a single charge for that placement. The newsletter
 * slot is a single charge for one issue.
 *
 * The last two are subscriptions (Checkout mode subscription):
 * - placement_subscription: a recurring $299/mo Price, renewed until canceled.
 * - founding_sponsor: Mark's approved founding offer. A one-time $99 Price is
 *   billed on the first invoice, and the recurring $299/mo founding Price
 *   starts after a 14-day trial. The founding Price is its own Price (its own
 *   lookup key), so a later change to the standard monthly Price does not
 *   touch it. The 6-month lock is recorded on the subscription metadata and in
 *   sponsorships.price_locked_until.
 */

export const SPONSOR_CURRENCY = 'usd'

/**
 * Stripe product name and the card statement suffix. Card charges reject
 * statement_descriptor on this API version, so Checkout sends this as
 * statement_descriptor_suffix. 22 characters is the Stripe maximum.
 */
export const SPONSOR_BUSINESS_NAME = 'BestBotFor'

/** Shown beside each one-time sponsor option and on the Checkout pay button. */
export const SPONSOR_ONE_TIME_NOTICE = 'One-time payment, no auto-renewal.'

/** Shown beside the standard monthly subscription and on its Checkout pay button. */
export const SPONSOR_SUBSCRIPTION_NOTICE = 'Renews every month at $299 until you cancel. Cancel anytime; it ends at the close of the paid month.'

/** Founding sponsor terms. Days and months live here so copy and Checkout cannot drift. */
export const FOUNDING_TRIAL_DAYS = 14
/** A price lock, not a commitment. The sponsor can cancel anytime; the $299 price is guaranteed for this long. */
export const FOUNDING_PRICE_LOCK_MONTHS = 6
/** At most this many founding sponsors, counting paid unrefunded founding rows plus live founding checkout holds. */
export const FOUNDING_SPONSOR_CAP = 5

/** Shown when every founding spot is taken. */
export const FOUNDING_SOLD_OUT = 'All 5 founding sponsor spots are taken. Choose another option.'

/** Label of the required task-page field. */
export const SPONSOR_TASK_FIELD_LABEL = 'Which /best page do you want to sponsor?'

/** Shown in place of the price and terms on a form option whose checkout is not configured. */
export const SPONSOR_OFFERING_NOT_CONFIGURED = 'Checkout for this slot is not configured yet.'

/**
 * Shown beside the founding offer and on its Checkout pay button. Stripe caps
 * custom_text.submit.message at 1200 characters.
 */
export const SPONSOR_FOUNDING_NOTICE =
  '$99 today covers the first 2 weeks. Then $299 per month, renewing monthly. Founding price locked for 6 months. Cancel anytime.'

/** Shown on /sponsor next to the company field. The name is published on the guide. */
export const SPONSOR_COMPANY_PUBLISHED = 'Your company name is published with a Sponsored label.'

/** Shown on /sponsor. The tool card is not public until an admin approves it. */
export const SPONSOR_REVIEW_NOTICE =
  'Your tool card is reviewed before it goes live. If it is rejected, you can submit a new version once within 7 days. After that, the order is refunded from the Stripe dashboard. An approved card is published with a Sponsored label.'

/** Shown on the admin reject control. Rejecting a card does not call Stripe. */
export const SPONSOR_REFUND_NOTE =
  'Refunds are done in the Stripe dashboard. Rejecting a card does not refund the payment.'

/** Shown when an admin marks a refund_pending card after the dashboard refund. */
export const SPONSOR_MARK_REFUNDED_NOTE =
  'Refund the payment in the Stripe dashboard first. Marking it here does not call Stripe.'

/** Shown on a pending card whose original text contained invisible characters. */
export const SPONSOR_INVISIBLE_WARNING =
  'Invisible characters were removed from this card. Read the name and description carefully.'

/** Buyer logo cap. Well under the old 200 KB limit so the page does not embed a large image. */
export const SPONSOR_LOGO_MAX_BYTES = 64 * 1024

export const SPONSOR_LOGO_HINT = 'PNG, JPEG, or WebP. 64 KB maximum.'

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
    billing: 'one_time',
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
    billing: 'one_time',
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
    billing: 'one_time',
  },
  {
    id: 'placement_subscription',
    lookupKey: 'sponsor_best_placement_monthly_recurring',
    priceEnv: 'STRIPE_PRICE_PLACEMENT_SUBSCRIPTION',
    unitAmount: 29_900,
    productName: 'Featured placement, monthly subscription',
    title: 'Featured placement, monthly subscription',
    summary: 'One featured tool slot on a single /best/[task] page, renewed every month until you cancel.',
    cadence: 'month',
    target: 'task',
    billing: 'subscription',
    interval: 'month',
  },
  {
    id: 'founding_sponsor',
    lookupKey: 'sponsor_founding_monthly',
    priceEnv: 'STRIPE_PRICE_FOUNDING_MONTHLY',
    unitAmount: 29_900,
    productName: 'Founding sponsor, monthly',
    title: 'Founding sponsor',
    summary:
      'One featured tool slot on a single /best/[task] page. $99 for the first 2 weeks, then $299/mo with the founding price locked for 6 months. Limited to 5 founding sponsors.',
    cadence: 'month',
    target: 'task',
    billing: 'subscription',
    interval: 'month',
    trialDays: FOUNDING_TRIAL_DAYS,
    priceLockMonths: FOUNDING_PRICE_LOCK_MONTHS,
    setup: {
      lookupKey: 'sponsor_founding_first_two_weeks',
      priceEnv: 'STRIPE_PRICE_FOUNDING_SETUP',
      unitAmount: 9_900,
      productName: 'Founding sponsor, first 2 weeks',
    },
  },
] as const

export type SponsorOffering = (typeof SPONSOR_OFFERINGS)[number]
export type SponsorOfferingId = SponsorOffering['id']

export function sponsorOffering(id: string): SponsorOffering | null {
  return SPONSOR_OFFERINGS.find((offering) => offering.id === id) ?? null
}

export type SubscriptionSponsorOffering = Extract<SponsorOffering, { billing: 'subscription' }>
export type SubscriptionSponsorOfferingId = SubscriptionSponsorOffering['id']
export type TaskSponsorOfferingId = Extract<SponsorOffering, { target: 'task' }>['id']

export const SUBSCRIPTION_SPONSOR_OFFERING_IDS: readonly SubscriptionSponsorOfferingId[] = SPONSOR_OFFERINGS.filter(
  (offering): offering is SubscriptionSponsorOffering => offering.billing === 'subscription',
).map((offering) => offering.id)

export const TASK_SPONSOR_OFFERING_IDS: readonly TaskSponsorOfferingId[] = SPONSOR_OFFERINGS.filter(
  (offering) => offering.target === 'task',
).map((offering) => offering.id as TaskSponsorOfferingId)

export function isSubscriptionOffering(id: string): id is SubscriptionSponsorOfferingId {
  return (SUBSCRIPTION_SPONSOR_OFFERING_IDS as readonly string[]).includes(id)
}

export function isTaskOffering(id: string): id is TaskSponsorOfferingId {
  return (TASK_SPONSOR_OFFERING_IDS as readonly string[]).includes(id)
}

/** The recurring offering, or null for a one-time offering or an unknown id. */
export function subscriptionOffering(id: string): SubscriptionSponsorOffering | null {
  const offering = sponsorOffering(id)
  return offering && offering.billing === 'subscription' ? offering : null
}

/** Trial days before the recurring Price is first charged. 0 when there is no trial. */
export function sponsorTrialDays(offering: SponsorOffering): number {
  return 'trialDays' in offering ? offering.trialDays : 0
}

/** Months the founding price is locked. 0 when the offering has no lock. */
export function sponsorPriceLockMonths(offering: SponsorOffering): number {
  return 'priceLockMonths' in offering ? offering.priceLockMonths : 0
}

/** Line shown beside the offering and sent as the Checkout submit message. */
export function sponsorOfferingNotice(offering: SponsorOffering): string {
  if (offering.id === 'founding_sponsor') return SPONSOR_FOUNDING_NOTICE
  if (offering.billing === 'subscription') return SPONSOR_SUBSCRIPTION_NOTICE
  return SPONSOR_ONE_TIME_NOTICE
}

/** Price shown on the radio label. */
export function sponsorOfferingPriceLabel(offering: SponsorOffering): string {
  const recurring = sponsorPriceLabel(offering.unitAmount)
  if ('setup' in offering) return `${sponsorPriceLabel(offering.setup.unitAmount)} for 2 weeks, then ${recurring}/mo`
  if (offering.billing === 'subscription') return `${recurring}/mo`
  return recurring
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

/**
 * Server-side one-time setup Price for an offering that has one (the founding
 * $99 first period). Null when the offering has no setup Price, or when the
 * env value is not a Stripe Price id.
 */
export function sponsorSetupPriceId(
  offeringId: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const offering = sponsorOffering(offeringId)
  if (!offering || !('setup' in offering)) return null
  const value = env[offering.setup.priceEnv]?.trim() ?? ''
  if (!/^price_[A-Za-z0-9_]+$/.test(value)) return null
  return value
}

/** True when every Price this offering charges is configured. */
export function sponsorOfferingConfigured(
  offeringId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const offering = sponsorOffering(offeringId)
  if (!offering || !sponsorPriceId(offering.id, env)) return false
  if ('setup' in offering) return sponsorSetupPriceId(offering.id, env) !== null
  return true
}
