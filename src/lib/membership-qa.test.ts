import { describe, expect, it, vi } from 'vitest'
import { checkoutNoticeMessage } from './billing-notice'
import { createMembershipSession, membershipCheckoutParams } from './membership-checkout'
import { hadMembershipBefore, membershipPricingCacheKey, publicPriceCacheKey } from './membership-plans'

const env = {
  STRIPE_PRICE_MEMBER_MONTHLY: 'price_monthly123',
  STRIPE_PRICE_MEMBER_ANNUAL: 'price_annual456',
  STRIPE_COUPON_FOUNDING: 'bbf_founding_19_first_year',
}
const base = { plan: 'annual' as const, userId: 'user_1', customer: null, foundingOpen: true, successUrl: 'https://x/s', cancelUrl: 'https://x/c', env }

describe('pricing cache keys', () => {
  it('change with each price ID, the coupon ID and the deploy version', () => {
    const key = membershipPricingCacheKey('sha-aaa', env)
    expect(key.join('|')).toContain('price_annual456')
    expect(key.join('|')).toContain('price_monthly123')
    expect(key.join('|')).toContain('bbf_founding_19_first_year')
    expect(membershipPricingCacheKey('sha-bbb', env)).not.toEqual(key)
    expect(membershipPricingCacheKey('sha-aaa', { ...env, STRIPE_PRICE_MEMBER_ANNUAL: 'price_live1' })).not.toEqual(key)
    expect(membershipPricingCacheKey('sha-aaa', { ...env, STRIPE_PRICE_MEMBER_MONTHLY: 'price_live2' })).not.toEqual(key)
    expect(membershipPricingCacheKey('sha-aaa', { ...env, STRIPE_COUPON_FOUNDING: 'other' })).not.toEqual(key)
    expect(publicPriceCacheKey('price_a', 'v1')).not.toEqual(publicPriceCacheKey('price_b', 'v1'))
    expect(publicPriceCacheKey('price_a', 'v1')).not.toEqual(publicPriceCacheKey('price_a', 'v2'))
  })
  it('the pricing module builds its keys from the IDs and catalogCacheVersion', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/pricing.ts', 'utf8')
    expect(src).toContain('membershipPricingCacheKey(catalogCacheVersion())')
    expect(src).toContain('publicPriceCacheKey(priceId, catalogCacheVersion())')
  })
})

describe('coupon exhausted or invalid at checkout', () => {
  const couponError = Object.assign(new Error('This coupon has reached its max redemptions.'), { type: 'StripeInvalidRequestError', param: 'discounts[0][coupon]' })
  it('returns founding-closed instead of throwing', async () => {
    const params = membershipCheckoutParams({ ...base, foundingEligible: true })!
    const create = vi.fn().mockRejectedValue(couponError)
    await expect(createMembershipSession({ checkout: { sessions: { create } } }, params)).resolves.toEqual({ kind: 'founding-closed' })
    expect(checkoutNoticeMessage('founding-closed')).toMatch(/founding offer has just closed/)
  })
  it('rethrows other errors and coupon-less failures', async () => {
    const withCoupon = membershipCheckoutParams({ ...base, foundingEligible: true })!
    const other = Object.assign(new Error('boom'), { type: 'StripeAPIError' })
    await expect(createMembershipSession({ checkout: { sessions: { create: vi.fn().mockRejectedValue(other) } } }, withCoupon)).rejects.toThrow('boom')
    const monthly = membershipCheckoutParams({ ...base, plan: 'monthly' })!
    await expect(createMembershipSession({ checkout: { sessions: { create: vi.fn().mockRejectedValue(couponError) } } }, monthly)).rejects.toThrow()
  })
  it('passes the session URL through on success', async () => {
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    const result = await createMembershipSession({ checkout: { sessions: { create } } }, membershipCheckoutParams(base)!)
    expect(result).toEqual({ kind: 'session', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  })
  it('the action redirects to the notice', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/app/pricing/actions.ts', 'utf8')).toContain("redirect('/pricing?notice=founding-closed')")
  })
})

describe('one founding seat per person', () => {
  const ids = ['price_annual456', 'price_monthly123']
  it('any earlier membership subscription, any status, uses the seat', () => {
    expect(hadMembershipBefore([], ids)).toBe(false)
    expect(hadMembershipBefore([{ stripePriceId: 'price_sponsor' }, { stripePriceId: null }], ids)).toBe(false)
    expect(hadMembershipBefore([{ stripePriceId: 'price_monthly123' }], ids)).toBe(true)
    expect(hadMembershipBefore([{ stripePriceId: 'price_annual456' }], ids)).toBe(true)
  })
  it('a returning member gets no coupon; a new one does', () => {
    expect(membershipCheckoutParams({ ...base, foundingEligible: false })).not.toHaveProperty('discounts')
    expect(membershipCheckoutParams({ ...base, foundingEligible: true })?.discounts).toEqual([{ coupon: 'bbf_founding_19_first_year' }])
  })
  it('the action checks history by Clerk user or Stripe customer and fails closed', async () => {
    const { readFileSync } = await import('node:fs')
    const action = readFileSync('src/app/pricing/actions.ts', 'utf8')
    const members = readFileSync('src/lib/members.ts', 'utf8')
    expect(members).toContain('or(eq(subscriptions.clerkUserId, userId), eq(subscriptions.stripeCustomerId, customer))')
    expect(action).toContain("stripe.subscriptions.list({ customer, status: 'all'")
    expect(action).toMatch(/catch \(error\) \{\n\s+console\.error\('founding eligibility lookup failed'[^\n]*\n\s+return false/)
  })
})
