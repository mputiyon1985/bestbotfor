/**
 * Membership plan config (pure, no Stripe calls). Price and coupon IDs come only
 * from env vars, so live objects can be swapped in without a code change.
 * The same price IDs gate /deals: see membershipPriceIds().
 */
export const MEMBER_PRICE_ENV = {
  monthly: 'STRIPE_PRICE_MEMBER_MONTHLY',
  annual: 'STRIPE_PRICE_MEMBER_ANNUAL',
} as const
export const FOUNDING_COUPON_ENV = 'STRIPE_COUPON_FOUNDING'

export type MemberPlan = keyof typeof MEMBER_PRICE_ENV
/** Annual is listed first and is the default. */
export const MEMBER_PLANS: readonly MemberPlan[] = ['annual', 'monthly']

export const MONEY_BACK_DAYS = 14
export const FREE_SAVED_PICKS = 10

type Env = Record<string, string | undefined>

const PRICE_ID = /^price_[A-Za-z0-9]{1,250}$/
const COUPON_ID = /^[A-Za-z0-9_-]{1,200}$/

export function memberPriceId(plan: MemberPlan, env: Env = process.env): string | null {
  const value = env[MEMBER_PRICE_ENV[plan]]?.trim() ?? ''
  return PRICE_ID.test(value) ? value : null
}

export function foundingCouponId(env: Env = process.env): string | null {
  const value = env[FOUNDING_COUPON_ENV]?.trim() ?? ''
  return COUPON_ID.test(value) ? value : null
}

/** Both membership prices must be set before /pricing sells anything. */
export function membershipConfigured(env: Env = process.env): boolean {
  return memberPriceId('monthly', env) !== null && memberPriceId('annual', env) !== null
}

/** Price IDs that count as an active membership (also the /deals gate). */
export function membershipPriceIds(env: Env = process.env): string[] {
  return MEMBER_PLANS.map((plan) => memberPriceId(plan, env)).filter((id): id is string => id !== null)
}

export function parseMemberPlan(value: unknown): MemberPlan | null {
  return value === 'annual' || value === 'monthly' ? value : null
}

/** The founding coupon only ever applies to the annual price ($29 - $10 = $19 for year one). */
export function couponForPlan(plan: MemberPlan, foundingOpen: boolean, env: Env = process.env): string | null {
  if (plan !== 'annual' || !foundingOpen) return null
  return foundingCouponId(env)
}

/** "$2.42" for 2900 cents over 12 months. */
export function perMonthFromAnnual(unitAmount: number): string {
  return `$${(Math.round(unitAmount / 12) / 100).toFixed(2)}`
}

export function wholeDollars(unitAmount: number): string {
  return unitAmount % 100 === 0 ? `$${unitAmount / 100}` : `$${(unitAmount / 100).toFixed(2)}`
}

export type FoundingOffer = { open: boolean; firstYearAmount: number | null; remaining: number | null }

/** Open only while the coupon is valid, is a USD amount-off or percent-off for one cycle, and has seats left. */
export function foundingOffer(
  coupon: {
    valid: boolean
    duration: string
    amount_off: number | null
    percent_off: number | null
    currency: string | null
    max_redemptions: number | null
    times_redeemed: number
  } | null,
  annualAmount: number | null,
): FoundingOffer {
  const closed = { open: false, firstYearAmount: null, remaining: null }
  if (!coupon || annualAmount == null || !coupon.valid || coupon.duration !== 'once') return closed
  if (coupon.max_redemptions == null) return closed
  const remaining = coupon.max_redemptions - coupon.times_redeemed
  if (remaining <= 0) return closed
  let first: number
  if (coupon.amount_off != null && coupon.currency === 'usd') first = annualAmount - coupon.amount_off
  else if (coupon.percent_off != null) first = Math.round(annualAmount * (1 - coupon.percent_off / 100))
  else return closed
  if (first <= 0 || first >= annualAmount) return closed
  return { open: true, firstYearAmount: first, remaining }
}
