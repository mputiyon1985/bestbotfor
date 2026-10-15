'use server'

import { redirect } from 'next/navigation'
import { isClerkConfigured } from '@/lib/flags'
import { stripeCustomerIdForUser } from '@/lib/members'
import { isStripeHostedUrl } from '@/lib/redirect'
import { absoluteUrl } from '@/lib/site'
import { getStripe, stripePriceId } from '@/lib/stripe'

export async function checkoutAction(): Promise<void> {
  if (!isClerkConfigured()) redirect('/sign-in')
  const { auth } = await import('@clerk/nextjs/server')
  const { userId } = await auth.protect()
  const stripe = getStripe()
  const price = stripePriceId()
  if (!stripe || !price || !userId) redirect('/pricing')

  const customer = await stripeCustomerIdForUser(userId)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: absoluteUrl('/members?checkout=success'),
    cancel_url: absoluteUrl('/pricing?checkout=canceled'),
    client_reference_id: userId,
    metadata: { clerkUserId: userId },
    subscription_data: { metadata: { clerkUserId: userId } },
    ...(customer ? { customer } : {}),
  })

  if (!session.url || !isStripeHostedUrl(session.url)) {
    redirect('/pricing')
  }
  redirect(session.url)
}
