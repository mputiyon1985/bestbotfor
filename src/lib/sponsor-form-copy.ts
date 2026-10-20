/**
 * Copy for the client sponsor form. This module is client-safe on purpose: it
 * holds strings only and imports nothing, so the 'use client' SponsorForm does
 * not pull the SPONSOR_OFFERINGS catalog (summaries, amounts, priceEnv names)
 * into the browser bundle. sponsor-offerings re-exports these for server code.
 */

/** Label of the required task-page field. */
export const SPONSOR_TASK_FIELD_LABEL = 'Which /best page do you want to sponsor?'

/** Shown in place of the price and terms on a form option whose checkout is not configured. */
export const SPONSOR_OFFERING_NOT_CONFIGURED = 'This option isn’t available right now.'

/** Label added to the founding option's title once every founding spot is taken. */
export const SPONSOR_SOLD_OUT_LABEL = 'Sold out'

/** Shown in place of the price and terms on the founding option once every founding spot is taken. */
export const SPONSOR_FOUNDING_SOLD_OUT_NOTICE = 'All founding sponsor spots are taken.'

/** Shown on /sponsor next to the company field. The name is published on the guide. */
export const SPONSOR_COMPANY_PUBLISHED = 'Your company name is published with a Sponsored label.'

/** Shown on /sponsor. The tool card is not public until an admin approves it. */
export const SPONSOR_REVIEW_NOTICE =
  'Your tool card is reviewed before it goes live. If it is rejected, you can submit a new version once within 7 days. After that, the order is refunded from the Stripe dashboard. An approved card is published with a Sponsored label.'

export const SPONSOR_LOGO_HINT = 'PNG, JPEG, or WebP. 64 KB maximum.'
