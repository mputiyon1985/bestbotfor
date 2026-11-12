import type Stripe from 'stripe'
import { couponForPlan, memberPriceId, type MemberPlan } from './membership-plans'
import { emailSchema } from './validation'

/** A buyer email we already know, or null. Checkout still asks when this is null. */
export function membershipBuyerEmail(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = emailSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Checkout Session params for a membership. No trial, no promotion-code box:
 * the only discount is the founding coupon, and only on the annual plan.
 */
export function membershipCheckoutParams(input: {
  plan: MemberPlan
  userId: string
  customer: string | null
  /** Signed-in email. Prefills Checkout when we do not already have a Customer. */
  email?: string | null
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
  const email = membershipBuyerEmail(input.email)
  // Stripe rejects customer and customer_email together. An existing Customer
  // already carries the email. A new buyer gets the signed-in address prefilled
  // so an abandoned session still has an email once they opt in.
  const metadata: Record<string, string> = {
    clerkUserId: input.userId,
    plan: input.plan,
    founding_coupon: coupon ? '1' : '0',
  }
  if (email) metadata.email = email
  return {
    mode: 'subscription',
    // Same as sponsor checkout: Managed Payments off, automatic_tax unset.
    managed_payments: { enabled: false },
    line_items: [{ price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    metadata,
    subscription_data: { metadata: { clerkUserId: input.userId, plan: input.plan } },
    // The promotions checkbox is consent, not the consent itself. A recovered
    // session stays payable for 30 days and would keep a founding coupon past
    // the cap, so the recovery URL stays off while that coupon is attached.
    consent_collection: { promotions: 'auto' },
    ...(coupon
      ? { discounts: [{ coupon }] }
      : {
          after_expiration: {
            recovery: { enabled: true, allow_promotion_codes: false },
          },
        }),
    ...(input.customer ? { customer: input.customer } : email ? { customer_email: email } : {}),
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
