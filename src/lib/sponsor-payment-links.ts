/**
 * Stripe live Payment Links shown on /sponsor. These are fixed public URLs
 * on buy.stripe.com, so they hold no secret. Fulfillment for every link is
 * manual by email. The webhook does not create a sponsorships row. The
 * Monthly link can upsert a membership `subscriptions` row with no Clerk
 * user, which grants nothing. The one-time links have no subscription, so
 * they write no membership row either. The team sets the placement up by
 * email (docs/runbooks/sponsor-reject-refund.md, "Payment Link sales").
 * A featured-week sale does not claim a /best page slot.
 *
 * The prices in `terms` are copy, not read from Stripe. If a link's Price
 * changes in Stripe, update this file in the same change
 * (docs/runbooks/sponsor-payment-links.md has the record to compare).
 *
 * Mark approved the two one-time links on 2026-11-12. They already existed
 * in live Stripe (featured week `plink_1Uaz53IJUbygfAucHbIqUfzb`, newsletter
 * mention `plink_1Uaz54IJUbygfAuckBQccflM`). This file records their public
 * URLs. It does not create or change Stripe objects.
 *
 * The founding Payment Link (plink_1URylTIJUbygfAuc07cebXfn) is retired. It
 * was deactivated in Stripe at the in-app founding go-live on 2026-10-19 and
 * removed from this list afterwards, so unsetting the founding Price vars can
 * never put a dead buy.stripe.com link back on /sponsor. Its record (Prices,
 * limit, past sales as `founding_link:` rows, which still count toward the
 * shared cap of 5) is in docs/runbooks/sponsor-payment-links.md.
 *
 * /sponsor shows them only when live billing is on, so a preview or local
 * build never sends a tester to a live charge.
 *
 * `billing` decides which card may say it renews. Only `subscription` gets
 * the renewal notice and the cancel line.
 */

export const SPONSOR_PAYMENT_LINK_HOST = 'buy.stripe.com'

export const SPONSOR_SUBSCRIPTION_NOTICE = 'Subscription, renews monthly until you cancel.'

/** Shown with every Payment Link, like the one-time form's Sponsored-label line. */
export const SPONSOR_SUBSCRIPTION_DISCLOSURE = 'Placements carry a Sponsored label and never change rankings. See'

/** The sponsor-subscriptions runbook points buyers at this line. Monthly link only. */
export const SPONSOR_CANCEL_LINE = 'To cancel, email'

export const SPONSOR_PAYMENT_LINKS = [
  {
    id: 'sponsor_monthly',
    billing: 'subscription',
    paymentLinkId: 'plink_1URyeXIJUbygfAucnLlkSP5u',
    url: 'https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02',
    title: 'Monthly sponsor',
    terms: '$299/mo. Cancel anytime.',
    cta: 'Subscribe monthly',
  },
  {
    id: 'featured_week',
    billing: 'one_time',
    paymentLinkId: 'plink_1Uaz53IJUbygfAucHbIqUfzb',
    url: 'https://buy.stripe.com/28E28s2bCaOeaVI4AYfrW06',
    title: 'Featured spot · 1 week',
    terms: '$99 one-time. No auto-renewal.',
    cta: 'Buy a featured week',
  },
  {
    id: 'newsletter_mention',
    billing: 'one_time',
    paymentLinkId: 'plink_1Uaz54IJUbygfAuckBQccflM',
    url: 'https://buy.stripe.com/dRmaEYbMc6xY8NA2sQfrW07',
    title: 'Newsletter mention',
    terms: '$49 one-time. No auto-renewal.',
    cta: 'Buy a newsletter mention',
  },
] as const

/** The live /sponsor price note about the links: singular while there is one link (Sentinel P3-1 on #98). */
export const SPONSOR_PAYMENT_LINKS_NOTE: string =
  (SPONSOR_PAYMENT_LINKS as readonly unknown[]).length === 1
    ? 'The Payment Link below is a separate Stripe link with its own price set in Stripe.'
    : 'The Payment Links below are separate Stripe links with their own prices set in Stripe.'
