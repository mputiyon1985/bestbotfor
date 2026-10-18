/**
 * Stripe live Payment Links for the sponsor subscriptions (created in the
 * Stripe dashboard API on October 18, 2026). These are fixed public URLs on
 * buy.stripe.com, so they hold no secret. Fulfillment for these is manual
 * until the in-app subscription checkout ships: the webhook records the
 * subscription and the team sets up the placement by email.
 *
 * /sponsor shows them only when live billing is on, so a preview or local
 * build never sends a tester to a live charge.
 */

export const SPONSOR_PAYMENT_LINK_HOST = 'buy.stripe.com'

/** Stripe restrictions.completed_sessions.limit on the founding link. */
export const FOUNDING_SPONSOR_LIMIT = 5

export const SPONSOR_SUBSCRIPTION_NOTICE = 'Subscription, renews monthly until you cancel.'

export const SPONSOR_PAYMENT_LINKS = [
  {
    id: 'founding_sponsor',
    paymentLinkId: 'plink_1URylTIJUbygfAuc07cebXfn',
    url: 'https://buy.stripe.com/fZudRabMce0q5BoebyfrW04',
    title: 'Founding sponsor',
    terms: `$99 for the first 2 weeks, then $299/mo. Founding price locked for 6 months. Cancel anytime. Limited to ${FOUNDING_SPONSOR_LIMIT} sponsors.`,
    cta: 'Become a founding sponsor',
  },
  {
    id: 'sponsor_monthly',
    paymentLinkId: 'plink_1URyeXIJUbygfAucnLlkSP5u',
    url: 'https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02',
    title: 'Monthly sponsor',
    terms: '$299/mo. Cancel anytime.',
    cta: 'Subscribe monthly',
  },
] as const
