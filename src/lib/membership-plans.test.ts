import { describe, expect, it } from 'vitest'
import { membershipCheckoutParams } from './membership-checkout'
import {
  couponForPlan,
  foundingOffer,
  MEMBER_PLANS,
  membershipConfigured,
  membershipPriceIds,
  memberPriceId,
  parseMemberPlan,
  perMonthFromAnnual,
  wholeDollars,
} from './membership-plans'

const env = {
  STRIPE_PRICE_MEMBER_MONTHLY: 'price_monthly123',
  STRIPE_PRICE_MEMBER_ANNUAL: ' price_annual456 ',
  STRIPE_COUPON_FOUNDING: 'bbf_founding_19_first_year',
}
const coupon = { valid: true, duration: 'once', amount_off: 1000, percent_off: null, currency: 'usd', max_redemptions: 100, times_redeemed: 0 }

describe('membership env config', () => {
  it('unset or malformed env sells nothing and gates nobody', () => {
    expect(membershipConfigured({})).toBe(false)
    expect(membershipPriceIds({})).toEqual([])
    expect(membershipConfigured({ ...env, STRIPE_PRICE_MEMBER_ANNUAL: 'prod_x' })).toBe(false)
    expect(membershipConfigured({ STRIPE_PRICE_MEMBER_MONTHLY: env.STRIPE_PRICE_MEMBER_MONTHLY })).toBe(false)
  })
  it('reads trimmed price ids, annual first', () => {
    expect(MEMBER_PLANS[0]).toBe('annual')
    expect(memberPriceId('annual', env)).toBe('price_annual456')
    expect(membershipPriceIds(env)).toEqual(['price_annual456', 'price_monthly123'])
  })
  it('accepts only known plans', () => {
    expect(parseMemberPlan('annual')).toBe('annual')
    expect(parseMemberPlan('price_annual456')).toBeNull()
    expect(parseMemberPlan(null)).toBeNull()
  })
})

describe('copy math', () => {
  it('$29/yr is about $2.42/mo', () => {
    expect(wholeDollars(2900)).toBe('$29')
    expect(wholeDollars(400)).toBe('$4')
    expect(perMonthFromAnnual(2900)).toBe('$2.42')
  })
})

describe('founding offer', () => {
  it('$10 off once on $29 gives $19 with 100 seats', () => {
    expect(foundingOffer(coupon, 2900)).toEqual({ open: true, firstYearAmount: 1900, remaining: 100 })
  })
  it('closes when sold out, invalid, uncapped, repeating, or missing', () => {
    expect(foundingOffer({ ...coupon, times_redeemed: 100 }, 2900).open).toBe(false)
    expect(foundingOffer({ ...coupon, valid: false }, 2900).open).toBe(false)
    expect(foundingOffer({ ...coupon, max_redemptions: null }, 2900).open).toBe(false)
    expect(foundingOffer({ ...coupon, duration: 'forever' }, 2900).open).toBe(false)
    expect(foundingOffer({ ...coupon, amount_off: 5000 }, 2900).open).toBe(false)
    expect(foundingOffer(null, 2900).open).toBe(false)
  })
  it('coupon applies to annual only', () => {
    expect(couponForPlan('annual', true, env)).toBe('bbf_founding_19_first_year')
    expect(couponForPlan('monthly', true, env)).toBeNull()
    expect(couponForPlan('annual', false, env)).toBeNull()
  })
})

describe('checkout params', () => {
  const base = { userId: 'user_1', customer: null, successUrl: 'https://x/s', cancelUrl: 'https://x/c', env }
  it('annual with founding open: annual price + coupon, no trial, no promo box', () => {
    const p = membershipCheckoutParams({ ...base, plan: 'annual', foundingOpen: true })!
    expect(p.line_items).toEqual([{ price: 'price_annual456', quantity: 1 }])
    expect(p.discounts).toEqual([{ coupon: 'bbf_founding_19_first_year' }])
    expect(p.mode).toBe('subscription')
    expect(p.subscription_data).not.toHaveProperty('trial_period_days')
    expect(p).not.toHaveProperty('allow_promotion_codes')
    expect(p.subscription_data?.metadata).toEqual({ clerkUserId: 'user_1', plan: 'annual' })
  })
  it('monthly never gets the coupon', () => {
    const p = membershipCheckoutParams({ ...base, plan: 'monthly', foundingOpen: true })!
    expect(p.line_items).toEqual([{ price: 'price_monthly123', quantity: 1 }])
    expect(p).not.toHaveProperty('discounts')
  })
  it('returns null when the price env is unset', () => {
    expect(membershipCheckoutParams({ ...base, env: {}, plan: 'annual', foundingOpen: true })).toBeNull()
  })
})
