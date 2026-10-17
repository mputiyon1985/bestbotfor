import type Stripe from 'stripe'
import { SPONSOR_BUSINESS_NAME, SPONSOR_CURRENCY, SPONSOR_OFFERINGS, type SponsorOffering } from './sponsor-offerings'
import { assertTestSetupKey, STRIPE_API_VERSION } from './stripe-key'

export { STRIPE_API_VERSION }

type PriceRecord = {
  id: string
  lookup_key?: string | null
  unit_amount?: number | null
  currency?: string | null
  active?: boolean
  recurring?: { interval?: string | null } | null
  product?: string | { id: string } | null
}

/**
 * Advertising placements are not eligible for Managed Payments, so products
 * are created without a Managed Payments tax code and prices omit tax_behavior.
 * Checkout disables managed_payments and leaves automatic_tax unset.
 */
export async function ensureSponsorPrice(stripe: Stripe, offering: SponsorOffering): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [offering.lookupKey], limit: 1 })
  const current = existing.data[0] as PriceRecord | undefined
  if (
    current &&
    current.active !== false &&
    current.currency === SPONSOR_CURRENCY &&
    current.unit_amount === offering.unitAmount &&
    !current.recurring
  ) {
    return current.id
  }

  const productFromPrice = typeof current?.product === 'string' ? current.product : current?.product?.id
  const productId =
    productFromPrice ??
    (
      await stripe.products.create(
        {
          name: SPONSOR_BUSINESS_NAME,
          statement_descriptor: SPONSOR_BUSINESS_NAME,
          metadata: { offering: offering.id, lookup_key: offering.lookupKey },
        },
        { idempotencyKey: `sponsor-product-${offering.lookupKey}-${SPONSOR_BUSINESS_NAME}` },
      )
    ).id

  const created = await stripe.prices.create(
    {
      product: productId,
      currency: SPONSOR_CURRENCY,
      unit_amount: offering.unitAmount,
      lookup_key: offering.lookupKey,
      transfer_lookup_key: true,
      nickname: offering.productName,
      metadata: { offering: offering.id },
    },
    { idempotencyKey: `sponsor-price-${offering.lookupKey}-${offering.unitAmount}` },
  )
  return created.id
}

export function formatSponsorPriceLine(envName: string, priceId: string): string {
  if (!/^STRIPE_PRICE_[A-Z0-9_]+$/.test(envName)) throw new Error('unexpected price env')
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) throw new Error('unexpected price id')
  return `${envName}=${priceId}`
}

/**
 * Creates test-mode Products and Prices. Refuses live keys even when
 * STRIPE_ALLOW_LIVE is true. Returns env assignment lines and nothing else.
 */
export async function setupSponsorPrices(input: {
  key: string
  env?: Record<string, string | undefined>
  createStripe: (key: string) => Stripe
}): Promise<string[]> {
  assertTestSetupKey(input.key, input.env)
  const stripe = input.createStripe(input.key)
  const lines: string[] = []
  for (const offering of SPONSOR_OFFERINGS) {
    const priceId = await ensureSponsorPrice(stripe, offering)
    lines.push(formatSponsorPriceLine(offering.priceEnv, priceId))
  }
  return lines
}
