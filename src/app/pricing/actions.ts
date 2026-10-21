'use server'

import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { billingNoticeQuery } from '@/lib/billing-notice'
import { getDb } from '@/lib/db'
import { isClerkConfigured } from '@/lib/flags'
import { rateLimitKey } from '@/lib/ip'
import { membershipCheckoutParams } from '@/lib/membership-checkout'
import { membershipConfigured, parseMemberPlan } from '@/lib/membership-plans'
import { stripeCustomerIdForUser } from '@/lib/members'
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
  const params = membershipCheckoutParams({
    plan,
    userId,
    customer,
    foundingOpen: pricing.founding.open,
    successUrl: absoluteUrl('/members?checkout=success'),
    cancelUrl: absoluteUrl('/pricing?checkout=canceled'),
  })
  if (!params) redirect('/pricing')
  const session = await stripe.checkout.sessions.create(params)

  if (!session.url || !isStripeHostedUrl(session.url)) {
    redirect('/pricing')
  }
  redirect(session.url)
}
