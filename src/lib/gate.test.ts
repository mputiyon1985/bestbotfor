import { describe, expect, it } from 'vitest'
import { bestSubscriptionStatus, evaluateMemberAccess } from './gate'

describe('evaluateMemberAccess', () => {
  it('requires a signed-in user, configured billing, and an active or trialing subscription', () => {
    expect(evaluateMemberAccess({ userId: null, stripeConfigured: true, subscriptionStatus: 'active' })).toEqual({
      allowed: false,
      reason: 'unauthenticated',
    })
    expect(evaluateMemberAccess({ userId: 'user_1', stripeConfigured: false, subscriptionStatus: 'active' })).toEqual({
      allowed: false,
      reason: 'billing-disabled',
    })
    expect(evaluateMemberAccess({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'canceled' })).toEqual({
      allowed: false,
      reason: 'subscription-required',
    })
    expect(evaluateMemberAccess({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'active' })).toEqual({
      allowed: true,
      userId: 'user_1',
    })
    expect(evaluateMemberAccess({ userId: 'user_1', stripeConfigured: true, subscriptionStatus: 'trialing' }).allowed).toBe(true)
  })

  it('prefers active over trialing when several rows exist', () => {
    expect(bestSubscriptionStatus(['canceled', 'trialing', 'active'])).toBe('active')
    expect(bestSubscriptionStatus(['past_due', 'trialing'])).toBe('trialing')
    expect(bestSubscriptionStatus([])).toBeNull()
  })
})
