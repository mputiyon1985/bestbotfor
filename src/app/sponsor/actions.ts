'use server'

import type Stripe from 'stripe'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { getDb } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { isStripeHostedUrl } from '@/lib/redirect'
import { parseSponsorCheckout, sponsorCheckoutParams } from '@/lib/sponsor-checkout'
import { absoluteUrl } from '@/lib/site'
import { getStripe } from '@/lib/stripe'

export type SponsorFormState = { status: 'idle' | 'error'; message: string }

export async function sponsorCheckoutAction(_previous: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  const parsed = parseSponsorCheckout(formData)
  if (!parsed.ok) return { status: 'error', message: parsed.message }

  const stripe = getStripe()
  if (!stripe) return { status: 'error', message: 'That offering is not available yet.' }

  const headerStore = await headers()
  const allowed = await allowRate(
    getDb(),
    rateLimitKey(clientIp(headerStore), 'sponsor'),
    ACTION_LIMITS.sponsor.limit,
    ACTION_LIMITS.sponsor.windowMs,
    { failClosed: true },
  )
  if (!allowed) return { status: 'error', message: 'Too many checkout attempts. Try again in an hour.' }

  const built = sponsorCheckoutParams({
    ...parsed.value,
    successUrl: absoluteUrl('/sponsor/success?session_id={CHECKOUT_SESSION_ID}'),
    cancelUrl: absoluteUrl('/sponsor/cancel'),
  })

  const url = await hostedCheckoutUrl(stripe, built.params, built.idempotencyKey)
  if (!url) return { status: 'error', message: 'Checkout could not be started. Try again.' }
  redirect(url)
}

async function hostedCheckoutUrl(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
): Promise<string | null> {
  try {
    const session = await stripe.checkout.sessions.create(params, { idempotencyKey })
    if (!session.url || !isStripeHostedUrl(session.url)) return null
    return session.url
  } catch (error) {
    console.error('sponsor checkout failed', error instanceof Error ? error.name : 'error')
    return null
  }
}
