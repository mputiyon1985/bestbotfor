import type Stripe from 'stripe'
import { couponForPlan, memberPriceId, type MemberPlan } from './membership-plans'

/**
 * Checkout Session params for a membership. No trial, no promotion-code box:
 * the only discount is the founding coupon, and only on the annual plan.
 */
export function membershipCheckoutParams(input: {
  plan: MemberPlan
  userId: string
  customer: string | null
  foundingOpen: boolean
  /** False when this user or customer already had a membership subscription (one founding seat each). */
  foundingEligible?: boolean
  successUrl: string
  cancelUrl: string
  env?: Record<string, string | undefined>
}): Stripe.Checkout.SessionCreateParams | null {
  const env = input.env ?? process.env
  const price = memberPriceId(input.plan, env)
  if (!price) return null
  const coupon = couponForPlan(input.plan, input.foundingOpen && input.foundingEligible !== false, env)
  return {
    mode: 'subscription',
    // Same as sponsor checkout: Managed Payments off, automatic_tax unset.
    managed_payments: { enabled: false },
    line_items: [{ price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    metadata: { clerkUserId: input.userId, plan: input.plan },
    subscription_data: { metadata: { clerkUserId: input.userId, plan: input.plan } },
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    ...(input.customer ? { customer: input.customer } : {}),
  }
}

export type MembershipSessionResult = { kind: 'session'; url: string | null } | { kind: 'founding-closed' }

function isCouponError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { type?: string; param?: string; code?: string; message?: string }
  if (e.type !== 'StripeInvalidRequestError') return false
  return /coupon|discount/i.test(`${e.param ?? ''} ${e.code ?? ''} ${e.message ?? ''}`)
}

/**
 * Creates the Checkout Session. If the founding coupon was used up or became invalid after the
 * pricing cache was filled, Stripe rejects the session: report founding-closed instead of an
 * error page. Any other error, or an error without a coupon, is rethrown.
 */
export async function createMembershipSession(
  stripe: { checkout: { sessions: { create: (params: Stripe.Checkout.SessionCreateParams) => Promise<{ url: string | null }> } } },
  params: Stripe.Checkout.SessionCreateParams,
): Promise<MembershipSessionResult> {
  try {
    const session = await stripe.checkout.sessions.create(params)
    return { kind: 'session', url: session.url }
  } catch (error) {
    if (params.discounts?.length && isCouponError(error)) return { kind: 'founding-closed' }
    throw error
  }
}
