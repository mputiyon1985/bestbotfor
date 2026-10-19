'use server'

import type Stripe from 'stripe'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { getDb } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { isStripeHostedUrl } from '@/lib/redirect'
import { SPONSOR_OPENING_SOON, sponsorCheckoutClosed } from '@/lib/sponsor-checkout-gate'
import {
  FOUNDING_HOLD_LIMIT_MESSAGE,
  foundingHoldFormKey,
  foundingHoldTimedOutMessage,
  parseSponsorCheckout,
  sponsorCheckoutParams,
  sponsorRateLimitMessage,
} from '@/lib/sponsor-checkout'
import { claimSponsorSlot, releaseSponsorSlot } from '@/lib/sponsor-availability'
import { foundingCheckoutExpiresAt, foundingHoldMinutesLeft, foundingHoldTooOldForNewSession } from '@/lib/sponsor-hold-window'
import { readSponsorCardForm, savePendingSponsorCard, saveSponsorCardForSession } from '@/lib/sponsor-card'
import { verifyPaidSponsorCheckout } from '@/lib/sponsor-session'
import {
  requestHostFromHeaders,
  requestOriginFromHeaders,
  sponsorReturnOrigin,
  sponsorReturnUrls,
} from '@/lib/sponsor-return-url'
import { getStripe } from '@/lib/stripe'

export type SponsorFormState = { status: 'idle' | 'error'; message: string }

export async function sponsorCheckoutAction(_previous: SponsorFormState, formData: FormData): Promise<SponsorFormState> {
  if (sponsorCheckoutClosed()) return { status: 'error', message: SPONSOR_OPENING_SOON }

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

  const taskSlug = parsed.value.taskSlug
  const founding = parsed.value.offering === 'founding_sponsor'
  let claimedAt: number | undefined
  // True only when this attempt created the hold (claimed_at = now). A repeat
  // of a live founding hold's own request reuses it and is never released.
  let freshHold = false
  const returnUrls = sponsorReturnUrls(
    sponsorReturnOrigin({
      requestOrigin: requestOriginFromHeaders(headerStore),
      requestHost: requestHostFromHeaders(headerStore),
    }),
  )
  // The hold's request_key, which a release must match.
  let holdKey = parsed.value.requestId
  if (taskSlug) {
    const claim = await claimSponsorSlot(getDb(), {
      taskSlug,
      offering: parsed.value.offering,
      requestKey: parsed.value.requestId,
      // A founding hold remembers its form, so while it is live only the identical form reaches Stripe.
      formKey: founding ? foundingHoldFormKey({ ...parsed.value, ...returnUrls }) : undefined,
      now: Date.now(),
    })
    // Includes the refusal of a changed form under a live founding hold (no Stripe call).
    if (!claim.ok) return { status: 'error', message: claim.message }
    claimedAt = claim.claimedAt
    freshHold = claim.fresh === true
    holdKey = claim.holdKey ?? holdKey
    // A separate per-address limit on new founding holds, so one address
    // cannot hold every founding spot for free. Only a new hold counts; Stripe
    // has not been called, so a refused new hold is released at once.
    if (founding && freshHold) {
      const holdDecision = await allowRate(
        getDb(),
        rateLimitKey(clientIp(headerStore), 'founding_hold'),
        ACTION_LIMITS.foundingHold.limit,
        ACTION_LIMITS.foundingHold.windowMs,
        { onError: 'closed' },
      )
      if (holdDecision !== 'allow') {
        await releaseSponsorSlot(getDb(), { taskSlug, requestKey: holdKey })
        return {
          status: 'error',
          message: holdDecision === 'limit' ? FOUNDING_HOLD_LIMIT_MESSAGE : sponsorRateLimitMessage(holdDecision),
        }
      }
    }
  }
  // Before Stripe is called, a hold can be released: a placement hold always,
  // a founding hold only when this attempt created it.
  const releasableBeforeStripe = !founding || freshHold

  let creativeId: string | undefined
  if (card?.ok) {
    const saved = await savePendingSponsorCard(getDb(), {
      requestKey: parsed.value.requestId,
      card: card.card,
      now: Date.now(),
    })
    if (!saved.ok) {
      if (taskSlug && releasableBeforeStripe) await releaseSponsorSlot(getDb(), { taskSlug, requestKey: holdKey })
      return { status: 'error', message: saved.message }
    }
    creativeId = String(saved.id)
  }

  // A founding session expires at claimed_at + 60 minutes. Within a minute of
  // that, even a replay of an existing session would open an expired page.
  if (founding && claimedAt != null && foundingCheckoutExpiresAt(claimedAt) * 1000 <= Date.now() + 60_000) {
    return { status: 'error', message: foundingHoldTimedOutMessage(foundingHoldMinutesLeft(claimedAt, Date.now())) }
  }

  let url: string | null = null
  try {
    const built = sponsorCheckoutParams({
      ...parsed.value,
      creativeId,
      claimedAt,
      successUrl: returnUrls.successUrl,
      cancelUrl: returnUrls.cancelUrl,
    })
    url = await hostedCheckoutUrl(stripe, built.params, built.idempotencyKey)
  } catch (error) {
    console.error('sponsor checkout params failed', error instanceof Error ? error.name : 'error')
  }
  if (!url) {
    // Once Stripe was called, a founding session may exist (a lost response),
    // payable until its expires_at, so the founding hold keeps counting.
    if (taskSlug && !founding) await releaseSponsorSlot(getDb(), { taskSlug, requestKey: holdKey })
    if (founding && claimedAt != null && foundingHoldTooOldForNewSession(claimedAt, Date.now())) {
      return { status: 'error', message: foundingHoldTimedOutMessage(foundingHoldMinutesLeft(claimedAt, Date.now())) }
    }
    return { status: 'error', message: 'Checkout could not be started. Try again.' }
  }
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

  const stripe = getStripe()
  if (!stripe) return { status: 'error', message: 'That checkout session is not a paid placement.' }
  const verified = await verifyPaidSponsorCheckout(stripe, String(formData.get('session_id') ?? ''))
  if (!verified.ok) return { status: 'error', message: verified.message }

  const saved = await saveSponsorCardForSession(getDb(), {
    card: card.card,
    now: Date.now(),
    checkout: verified.checkout,
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
