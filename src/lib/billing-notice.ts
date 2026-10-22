import type { RateLimitDecision } from './action-limit'

export type DeniedRateLimit = Exclude<RateLimitDecision, 'allow'>

/** Query value for a denied checkout or portal attempt. `limit` and `unavailable` stay distinct. */
export function billingNoticeQuery(decision: DeniedRateLimit): 'rate' | 'unavailable' {
  return decision === 'unavailable' ? 'unavailable' : 'rate'
}

/**
 * Copy for membership checkout. A full window and a limiter outage do not share a sentence,
 * matching sponsor checkout.
 */
export function checkoutNoticeMessage(notice: string): string | null {
  if (notice === 'unavailable') return 'Checkout is temporarily unavailable. Try again.'
  if (notice === 'rate') return 'Too many checkout attempts from this account. Try again in an hour.'
  if (notice === 'founding-closed') return 'The founding offer has just closed. You can still join at the regular price.'
  return null
}

/** Copy for the billing portal. A full window and a limiter outage do not share a sentence. */
export function portalNoticeMessage(notice: string): string | null {
  if (notice === 'unavailable') return 'The billing portal is temporarily unavailable. Try again.'
  if (notice === 'rate') return 'Too many billing portal attempts. Try again in an hour.'
  return null
}
