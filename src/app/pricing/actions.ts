'use server'

import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { billingNoticeQuery } from '@/lib/billing-notice'
import { getDb } from '@/lib/db'
import { isClerkConfigured } from '@/lib/flags'
import { rateLimitKey } from '@/lib/ip'
import { createMembershipSession, membershipCheckoutParams } from '@/lib/membership-checkout'
import { hadMembershipBefore, membershipConfigured, membershipPriceIds, parseMemberPlan } from '@/lib/membership-plans'
import { stripeCustomerIdForUser, subscriptionPriceHistory } from '@/lib/members'
import { getMembershipPricing } from '@/lib/pricing'
import { isStripeHostedUrl } from '@/lib/redirect'
import { absoluteUrl } from '@/lib/site'
import { getStripe } from '@/lib/stripe'

export async function checkoutAction(formData: FormData): Promise<void> {
  if (!isClerkConfigured()) redirect('/sign-in')
  const { auth } = await import('@clerk/nextjs/server')
  const { userId } = await auth.protect()
  const stripe = getStripe()
  const plan = parseMemberPlan(formData.get('plan'))
  if (!stripe || !userId || !plan || !membershipConfigured()) redirect('/pricing')
  const allowed = await allowRate(
    getDb(),
    rateLimitKey(userId, 'checkout'),
    ACTION_LIMITS.checkout.limit,
    ACTION_LIMITS.checkout.windowMs,
    { onError: 'closed' },
  )
  if (allowed !== 'allow') redirect(`/pricing?notice=${billingNoticeQuery(allowed)}`)

  const pricing = await getMembershipPricing()
  if (!pricing.configured || !pricing.plans[plan].available) redirect('/pricing?notice=unavailable')
  const customer = await stripeCustomerIdForUser(userId)
  const foundingEligible = plan === 'annual' && pricing.founding.open ? await isFoundingEligible(stripe, userId, customer) : false
  const params = membershipCheckoutParams({
    plan,
    userId,
    customer,
    foundingOpen: pricing.founding.open,
    foundingEligible,
    successUrl: absoluteUrl('/members?checkout=success'),
    cancelUrl: absoluteUrl('/pricing?checkout=canceled'),
  })
  if (!params) redirect('/pricing')
  const session = await createMembershipSession(stripe, params)
  if (session.kind === 'founding-closed') redirect('/pricing?notice=founding-closed')

  if (!session.url || !isStripeHostedUrl(session.url)) {
    redirect('/pricing')
  }
  redirect(session.url)
}

/**
 * One founding seat per person. Checks our subscriptions rows (by Clerk user or Stripe customer)
 * and, when we know the customer, Stripe's own subscription list. Any lookup error skips the coupon.
 */
async function isFoundingEligible(stripe: NonNullable<ReturnType<typeof getStripe>>, userId: string, customer: string | null): Promise<boolean> {
  const ids = membershipPriceIds()
  try {
    if (hadMembershipBefore(await subscriptionPriceHistory(userId, customer), ids)) return false
    if (!customer) return true
    const list = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 })
    const rows = list.data.flatMap((sub) => sub.items.data.map((item) => ({ stripePriceId: item.price.id })))
    return !hadMembershipBefore(rows, ids)
  } catch (error) {
    console.error('founding eligibility lookup failed', error instanceof Error ? error.name : 'error')
    return false
  }
}
