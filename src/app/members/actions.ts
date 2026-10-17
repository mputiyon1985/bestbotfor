'use server'

import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { getDb } from '@/lib/db'
import { isClerkConfigured } from '@/lib/flags'
import { rateLimitKey } from '@/lib/ip'
import { stripeCustomerIdForUser } from '@/lib/members'
import { isStripeHostedUrl } from '@/lib/redirect'
import { absoluteUrl } from '@/lib/site'
import { getStripe } from '@/lib/stripe'

export async function portalAction(): Promise<void> {
  if (!isClerkConfigured()) redirect('/sign-in')
  const { auth } = await import('@clerk/nextjs/server')
  const { userId } = await auth.protect()
  const stripe = getStripe()
  if (!stripe || !userId) redirect('/pricing')
  const allowed = await allowRate(
    getDb(),
    rateLimitKey(userId, 'portal'),
    ACTION_LIMITS.portal.limit,
    ACTION_LIMITS.portal.windowMs,
    { onError: 'closed' },
  )
  if (allowed !== 'allow') redirect('/members?notice=rate')
  const customer = await stripeCustomerIdForUser(userId)
  if (!customer) redirect('/pricing')
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: absoluteUrl('/members'),
  })
  if (!session.url || !isStripeHostedUrl(session.url)) redirect('/members')
  redirect(session.url)
}
