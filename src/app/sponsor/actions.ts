'use server'

import type Stripe from 'stripe'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { getDb } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { isStripeHostedUrl } from '@/lib/redirect'
import { parseSponsorCheckout, sponsorCheckoutParams, sponsorRateLimitMessage } from '@/lib/sponsor-checkout'
import { readSponsorCardForm, savePendingSponsorCard, saveSponsorCardForSession } from '@/lib/sponsor-card'
import {
  requestHostFromHeaders,
  requestOriginFromHeaders,
  sponsorReturnOrigin,
  sponsorReturnUrls,
} from '@/lib/sponsor-return-url'
import { getStripe } from '@/lib/stripe'

export type SponsorFormState = { status: 'idle' | 'error'; message: string }

export async function sponsorCheckoutAction(_previous: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  const parsed = parseSponsorCheckout(formData)
  if (!parsed.ok) return { status: 'error', message: parsed.message }

  const card = parsed.value.taskSlug ? await readSponsorCardForm(formData) : null
  if (card && !card.ok) return { status: 'error', message: card.message }

  const stripe = getStripe()
  if (!stripe) return { status: 'error', message: 'That offering is not available yet.' }

  const headerStore = await headers()
  const decision = await allowRate(
    getDb(),
    rateLimitKey(clientIp(headerStore), 'sponsor'),
    ACTION_LIMITS.sponsor.limit,
    ACTION_LIMITS.sponsor.windowMs,
    { onError: 'closed' },
  )
  if (decision !== 'allow') return { status: 'error', message: sponsorRateLimitMessage(decision) }

  let creativeId: string | undefined
  if (card?.ok) {
    const saved = await savePendingSponsorCard(getDb(), {
      requestKey: parsed.value.requestId,
      card: card.card,
      now: Date.now(),
    })
    if (!saved.ok) return { status: 'error', message: saved.message }
    creativeId = String(saved.id)
  }

  const returnUrls = sponsorReturnUrls(
    sponsorReturnOrigin({
      requestOrigin: requestOriginFromHeaders(headerStore),
      requestHost: requestHostFromHeaders(headerStore),
    }),
  )
  const built = sponsorCheckoutParams({
    ...parsed.value,
    creativeId,
    successUrl: returnUrls.successUrl,
    cancelUrl: returnUrls.cancelUrl,
  })

  const url = await hostedCheckoutUrl(stripe, built.params, built.idempotencyKey)
  if (!url) return { status: 'error', message: 'Checkout could not be started. Try again.' }
  redirect(url)
}

/** After Checkout, a buyer can submit or replace a card that is still pending. */
export async function submitSponsorCardAction(_previous: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  const card = await readSponsorCardForm(formData)
  if (!card.ok) return { status: 'error', message: card.message }

  const headerStore = await headers()
  const decision = await allowRate(
    getDb(),
    rateLimitKey(clientIp(headerStore), 'sponsor'),
    ACTION_LIMITS.sponsor.limit,
    ACTION_LIMITS.sponsor.windowMs,
    { onError: 'closed' },
  )
  if (decision !== 'allow') return { status: 'error', message: sponsorRateLimitMessage(decision) }

  const saved = await saveSponsorCardForSession(getDb(), {
    sessionId: String(formData.get('session_id') ?? ''),
    card: card.card,
    now: Date.now(),
  })
  if (!saved.ok) return { status: 'error', message: saved.message }
  return { status: 'idle', message: 'Your tool card was submitted for review.' }
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
