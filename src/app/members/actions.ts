'use server'

import { redirect } from 'next/navigation'
import { isClerkConfigured } from '@/lib/flags'
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
  const customer = await stripeCustomerIdForUser(userId)
  if (!customer) redirect('/pricing')
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: absoluteUrl('/members'),
  })
  if (!session.url || !isStripeHostedUrl(session.url)) redirect('/members')
  redirect(session.url)
}
