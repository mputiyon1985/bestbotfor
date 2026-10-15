const ACTIVE = new Set(['active', 'trialing'])

export type MemberAccess =
  | { allowed: true; userId: string }
  | { allowed: false; reason: 'unauthenticated' | 'subscription-required' | 'billing-disabled' }

/**
 * Premium content requires a signed-in Clerk user and an active or trialing
 * Stripe subscription. Billing that is not configured never unlocks content,
 * even if a leftover subscription row says active.
 */
export function evaluateMemberAccess(input: {
  userId: string | null
  stripeConfigured: boolean
  subscriptionStatus: string | null
}): MemberAccess {
  if (!input.userId) return { allowed: false, reason: 'unauthenticated' }
  if (!input.stripeConfigured) return { allowed: false, reason: 'billing-disabled' }
  if (input.subscriptionStatus && ACTIVE.has(input.subscriptionStatus)) {
    return { allowed: true, userId: input.userId }
  }
  return { allowed: false, reason: 'subscription-required' }
}

export function bestSubscriptionStatus(statuses: string[]): string | null {
  if (statuses.includes('active')) return 'active'
  if (statuses.includes('trialing')) return 'trialing'
  return statuses[0] ?? null
}
