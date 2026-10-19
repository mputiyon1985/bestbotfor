/**
 * The monthly placement subscription is hidden from the /sponsor form whenever
 * it cannot be bought (its Stripe price, Stripe key, or checkout surface is
 * missing), instead of showing "Checkout for this slot is not configured yet."
 * It shows again on its own once configured. Other offerings, including the
 * founding offer and its Sold out state, are left as they are.
 */
export const HIDDEN_WHEN_UNCONFIGURED = ['placement_subscription'] as const

export function visibleSponsorOfferings<T extends { id: string; available: boolean; soldOut?: boolean }>(offerings: T[]): T[] {
  return offerings.filter(
    (offering) =>
      offering.available || offering.soldOut || !(HIDDEN_WHEN_UNCONFIGURED as readonly string[]).includes(offering.id),
  )
}
