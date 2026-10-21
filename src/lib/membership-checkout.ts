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
  successUrl: string
  cancelUrl: string
  env?: Record<string, string | undefined>
}): Stripe.Checkout.SessionCreateParams | null {
  const env = input.env ?? process.env
  const price = memberPriceId(input.plan, env)
  if (!price) return null
  const coupon = couponForPlan(input.plan, input.foundingOpen, env)
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
