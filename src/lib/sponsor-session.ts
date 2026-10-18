import type Stripe from 'stripe'

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/
const TASK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const REFUSED = 'That checkout session is not a paid placement.'

export type VerifiedSponsorCheckout = {
  sessionId: string
  offering: 'placement_weekly' | 'placement_monthly'
  taskSlug: string
}

/**
 * The success-page form may store a card only after Stripe says this Checkout
 * session exists, is paid, and is a featured placement for one task.
 */
export async function verifyPaidSponsorCheckout(
  stripe: Stripe,
  sessionId: string,
): Promise<{ ok: true; checkout: VerifiedSponsorCheckout } | { ok: false; message: string }> {
  if (!SESSION_ID.test(sessionId)) return { ok: false, message: REFUSED }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (error) {
    console.error('sponsor session lookup failed', error instanceof Error ? error.name : 'error')
    return { ok: false, message: REFUSED }
  }
  if (session.id !== sessionId || session.payment_status !== 'paid' || session.mode !== 'payment') {
    return { ok: false, message: REFUSED }
  }
  const metadata = session.metadata ?? {}
  const offering = metadata.offering
  const taskSlug = metadata.task_slug ?? ''
  if (metadata.kind !== 'sponsorship') return { ok: false, message: REFUSED }
  if (offering !== 'placement_weekly' && offering !== 'placement_monthly') return { ok: false, message: REFUSED }
  if (!TASK.test(taskSlug)) return { ok: false, message: REFUSED }
  return { ok: true, checkout: { sessionId, offering, taskSlug } }
}
