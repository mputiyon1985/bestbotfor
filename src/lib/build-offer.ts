/**
 * AI Tool Audit + Setup, sold through two Stripe hosted Payment Links.
 * The URLs are public buy.stripe.com links and hold no secret. Prices below
 * are copy, not read from Stripe. If a link's Price changes in Stripe, change
 * this file in the same PR.
 *
 * Fulfillment is manual. Checkout does not book a time, write a row, or call
 * the Stripe API. After checkout, Mark emails the buyer to schedule.
 *
 * Public price copy may say "Introductory price" and "for our first clients;
 * it will go up." Do not render a cap, a remaining-spots counter, a scarcity
 * number, or a countdown.
 */

export const BUILD_PAYMENT_HOST = 'buy.stripe.com'

/** Primary offer: the working session, written plan, one setup, and 14 days of email support. */
export const BUILD_SESSION_URL = 'https://buy.stripe.com/7sYcN67vW9Kagg2aZmfrW08'

/** Add-on: one extra agent or workflow. */
export const BUILD_ADDON_URL = 'https://buy.stripe.com/eVq00kbMc1dE3tgd7ufrW09'

export const BUILD_SESSION_CTA = 'Book it — $497'

export const BUILD_ADDON_CTA = 'Add a workflow — $197'

export const BUILD_PRICE_LINE = '$497, one time. Fixed price.'

export const BUILD_INTRO_NOTE = 'Introductory price for our first clients; it will go up.'

export const BUILD_ADDON_LINE = 'Each additional agent or workflow is $197.'

export const BUILD_ONE_TIME_NOTICE = 'One-time payment, no auto-renewal.'

export const BUILD_FULFILLMENT = 'After checkout, Mark emails you within 1 business day to book your session.'

export const BUILD_PAYMENT_URLS = [BUILD_SESSION_URL, BUILD_ADDON_URL] as const
