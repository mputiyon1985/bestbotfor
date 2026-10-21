import 'server-only'

import { unstable_cache } from 'next/cache'
import { catalogCacheVersion } from './catalog-version'
import { foundingCouponId, foundingOffer, memberPriceId, membershipPricingCacheKey, publicPriceCacheKey, type FoundingOffer, type MemberPlan } from './membership-plans'
import { getStripe, stripePriceId } from './stripe'
import { liveModeAllowed } from './stripe-key'

export type PublicPrice =
  | { available: false; reason: 'unconfigured' | 'unavailable' }
  | { available: true; unitAmount: number; currency: string; interval: string | null; productName: string | null }

async function loadPriceById(priceId: string | null): Promise<PublicPrice> {
  const stripe = getStripe()
  if (!stripe || !priceId) return { available: false, reason: 'unconfigured' }
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
    if (price.livemode && !liveModeAllowed()) return { available: false, reason: 'unavailable' }
    if (price.unit_amount == null || !price.active) return { available: false, reason: 'unavailable' }
    const product = price.product
    const productName = product && typeof product === 'object' && 'name' in product && typeof product.name === 'string' ? product.name : null
    return {
      available: true,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
      productName,
    }
  } catch (error) {
    console.error('stripe price lookup failed', error instanceof Error ? error.name : 'error')
    return { available: false, reason: 'unavailable' }
  }
}

/** Keyed on the price ID and deploy version, so an env swap never serves the old price. */
export function getPublicPrice(): Promise<PublicPrice> {
  const priceId = stripePriceId()
  return unstable_cache(() => loadPriceById(priceId), publicPriceCacheKey(priceId, catalogCacheVersion()), { revalidate: 3600 })()
}

export type MembershipPricing =
  | { configured: false }
  | {
      configured: true
      plans: Record<MemberPlan, PublicPrice>
      founding: FoundingOffer
    }

async function loadMembershipPricing(): Promise<MembershipPricing> {
  const annualId = memberPriceId('annual')
  const monthlyId = memberPriceId('monthly')
  if (!getStripe() || !annualId || !monthlyId) return { configured: false }
  const [annual, monthly] = await Promise.all([loadPriceById(annualId), loadPriceById(monthlyId)])
  let founding: FoundingOffer = { open: false, firstYearAmount: null, remaining: null }
  const couponId = foundingCouponId()
  if (couponId && annual.available) {
    try {
      const coupon = await getStripe()!.coupons.retrieve(couponId)
      if (!coupon.livemode || liveModeAllowed()) founding = foundingOffer(coupon, annual.unitAmount)
    } catch (error) {
      console.error('stripe coupon lookup failed', error instanceof Error ? error.name : 'error')
    }
  }
  return { configured: true, plans: { annual, monthly }, founding }
}

/** Ten-minute cache: the founding seat count may lag a little; Stripe enforces max_redemptions itself. */
export function getMembershipPricing(): Promise<MembershipPricing> {
  return unstable_cache(loadMembershipPricing, membershipPricingCacheKey(catalogCacheVersion()), { revalidate: 600 })()
}
