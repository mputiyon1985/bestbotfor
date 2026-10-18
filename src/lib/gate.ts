const ACTIVE = new Set(['active', 'trialing'])

/** Active or trialing, and only when Stripe is configured. A leftover active row does not count. */
export function isPaidMembership(input: { stripeConfigured: boolean; subscriptionStatus: string | null }): boolean {
  return input.stripeConfigured && !!input.subscriptionStatus && ACTIVE.has(input.subscriptionStatus)
}

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
  if (isPaidMembership(input)) return { allowed: true, userId: input.userId }
  if (!input.stripeConfigured) return { allowed: false, reason: 'billing-disabled' }
  return { allowed: false, reason: 'subscription-required' }
}

export function bestSubscriptionStatus(statuses: string[]): string | null {
  if (statuses.includes('active')) return 'active'
  if (statuses.includes('trialing')) return 'trialing'
  return statuses[0] ?? null
}
