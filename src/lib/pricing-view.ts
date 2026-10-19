/**
 * What /pricing shows. With no membership Stripe price configured there is
 * nothing to buy, so the page says membership is coming soon and offers the
 * newsletter instead of buy-style copy. Once a price is set, the real pricing
 * returns on its own.
 */
export const MEMBERS_COMING_SOON_COPY = 'Members: coming soon. Join The Daily Bot to hear first.'

export type PricingView = 'price' | 'coming-soon' | 'unavailable'

export function pricingView(price: { available: true } | { available: false; reason: 'unconfigured' | 'unavailable' }): PricingView {
  if (price.available) return 'price'
  return price.reason === 'unconfigured' ? 'coming-soon' : 'unavailable'
}
