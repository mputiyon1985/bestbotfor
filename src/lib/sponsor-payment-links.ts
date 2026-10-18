/**
 * Stripe live Payment Links for the sponsor subscriptions (created in the
 * Stripe dashboard API on October 18, 2026). These are fixed public URLs on
 * buy.stripe.com, so they hold no secret. Fulfillment for these is manual
 * until the in-app subscription checkout ships. The webhook only upserts a row
 * in the membership `subscriptions` table with no Clerk user, which grants
 * nothing: no `sponsorships` row, card, or placement. The team sets up the
 * placement by email (docs/runbooks/sponsor-reject-refund.md, "Payment Link
 * sales").
 *
 * The prices in `terms` are copy, not read from Stripe. If a link's Price
 * changes in Stripe, update this file in the same change
 * (docs/runbooks/sponsor-payment-links.md has the read-back to compare).
 *
 * The founding cap of 5 is ONE cap shared with the in-app founding offer
 * (James, Oct 18). This link stays the only founding path until the in-app
 * founding Prices go live; then it is deactivated in Stripe and /sponsor
 * switches to the in-app offer.
 *
 * /sponsor shows them only when live billing is on, so a preview or local
 * build never sends a tester to a live charge.
 */

export const SPONSOR_PAYMENT_LINK_HOST = 'buy.stripe.com'

/** Stripe restrictions.completed_sessions.limit on the founding link. */
export const FOUNDING_SPONSOR_LIMIT = 5

export const SPONSOR_SUBSCRIPTION_NOTICE = 'Subscription, renews monthly until you cancel.'

/** Shown next to the subscriptions, like the one-time form's Sponsored-label line. */
export const SPONSOR_SUBSCRIPTION_DISCLOSURE = 'Placements carry a Sponsored label and never change rankings. See'

/** The sponsor-subscriptions runbook points buyers at this line. */
export const SPONSOR_CANCEL_LINE = 'To cancel, email'

export const SPONSOR_PAYMENT_LINKS = [
  {
    id: 'founding_sponsor',
    paymentLinkId: 'plink_1URylTIJUbygfAuc07cebXfn',
    url: 'https://buy.stripe.com/fZudRabMce0q5BoebyfrW04',
    title: 'Founding sponsor',
    terms: `$99 for the first 2 weeks, then $299/mo. Price locked at $299/mo for 6 months. Cancel anytime. Limited to ${FOUNDING_SPONSOR_LIMIT} sponsors.`,
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
