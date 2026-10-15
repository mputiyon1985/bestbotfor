import 'server-only'

import { unstable_cache } from 'next/cache'
import { getStripe, stripePriceId } from './stripe'

export type PublicPrice =
  | { available: false; reason: 'unconfigured' | 'unavailable' }
  | { available: true; unitAmount: number; currency: string; interval: string | null; productName: string | null }

async function loadPrice(): Promise<PublicPrice> {
  const stripe = getStripe()
  const priceId = stripePriceId()
  if (!stripe || !priceId) return { available: false, reason: 'unconfigured' }
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
    if (price.livemode) return { available: false, reason: 'unavailable' }
    if (price.unit_amount == null) return { available: false, reason: 'unavailable' }
    const product = price.product
    const productName = product && typeof product === 'object' && 'name' in product && typeof product.name === 'string' ? product.name : null
    return {
      available: true,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
      productName,
    }
  } catch (error) {
    console.error('stripe price lookup failed', error instanceof Error ? error.name : 'error')
    return { available: false, reason: 'unavailable' }
  }
}

export const getPublicPrice = unstable_cache(loadPrice, ['stripe-public-price'], { revalidate: 3600 })
