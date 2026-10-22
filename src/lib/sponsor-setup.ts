import type Stripe from 'stripe'
import {
  SPONSOR_BUSINESS_NAME,
  SPONSOR_CURRENCY,
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_OFFERINGS,
  sponsorOfferingNotice,
  type SponsorOffering,
} from './sponsor-offerings'
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

function productIdFrom(product: PriceRecord['product']): string | null {
  if (typeof product === 'string' && product.length > 0) return product
  if (product && typeof product === 'object' && product.id) return product.id
  return null
}

/**
 * A reused one-time Price keeps its id. Its Product is renamed when the name
 * or statement descriptor is not BestBotFor. Callers must already have passed
 * assertTestSetupKey. This does not run against live mode.
 */
async function ensureSponsorProductName(stripe: Stripe, product: PriceRecord['product']): Promise<void> {
  const productId = productIdFrom(product)
  if (!productId) return
  const current = await stripe.products.retrieve(productId)
  if ('deleted' in current && current.deleted) return
  if (current.name === SPONSOR_BUSINESS_NAME && current.statement_descriptor === SPONSOR_BUSINESS_NAME) return
  await stripe.products.update(productId, {
    name: SPONSOR_BUSINESS_NAME,
    statement_descriptor: SPONSOR_BUSINESS_NAME,
  })
}

/** One Stripe Price the sponsor flow charges. */
export type SponsorPriceSpec = {
  offeringId: string
  lookupKey: string
  priceEnv: string
  unitAmount: number
  productName: string
  notice: string
  /** Null for a one-time Price. */
  interval: 'month' | null
}

/** The recurring or one-time Price for an offering. */
export function sponsorPriceSpec(offering: SponsorOffering): SponsorPriceSpec {
  return {
    offeringId: offering.id,
    lookupKey: offering.lookupKey,
    priceEnv: offering.priceEnv,
    unitAmount: offering.unitAmount,
    productName: offering.productName,
    notice: sponsorOfferingNotice(offering),
    interval: offering.billing === 'subscription' ? offering.interval : null,
  }
}

/** Every Price spec, including the founding one-time $99 setup Price. */
export function sponsorPriceSpecs(): SponsorPriceSpec[] {
  const specs: SponsorPriceSpec[] = []
  for (const offering of SPONSOR_OFFERINGS) {
    specs.push(sponsorPriceSpec(offering))
    if ('setup' in offering) {
      specs.push({
        offeringId: offering.id,
        lookupKey: offering.setup.lookupKey,
        priceEnv: offering.setup.priceEnv,
        unitAmount: offering.setup.unitAmount,
        productName: offering.setup.productName,
        notice: SPONSOR_FOUNDING_NOTICE,
        interval: null,
      })
    }
  }
  return specs
}

function priceMatches(current: PriceRecord, spec: SponsorPriceSpec): boolean {
  if (current.active === false || current.currency !== SPONSOR_CURRENCY || current.unit_amount !== spec.unitAmount) return false
  if (spec.interval == null) return !current.recurring
  return current.recurring?.interval === spec.interval
}

/**
 * Advertising placements are not eligible for Managed Payments, so products
 * are created without a Managed Payments tax code and prices omit tax_behavior.
 * Checkout disables managed_payments and leaves automatic_tax unset.
 * A one-time spec only reuses a one-time Price; a monthly spec only reuses a
 * monthly recurring Price with the same amount.
 */
export async function ensureSponsorPriceSpec(stripe: Stripe, spec: SponsorPriceSpec): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 })
  const current = existing.data[0] as PriceRecord | undefined
  if (current && priceMatches(current, spec)) {
    await ensureSponsorProductName(stripe, current.product)
    return current.id
  }

  const kind = spec.interval ?? 'one_time'
  const productFromPrice = typeof current?.product === 'string' ? current.product : current?.product?.id
  const productId =
    productFromPrice ??
    (
      await stripe.products.create(
        {
          name: SPONSOR_BUSINESS_NAME,
          description: `${spec.productName}. ${spec.notice}`,
          statement_descriptor: SPONSOR_BUSINESS_NAME,
          metadata: { offering: spec.offeringId, lookup_key: spec.lookupKey },
        },
        { idempotencyKey: `sponsor-product-${spec.lookupKey}-${SPONSOR_BUSINESS_NAME}-${kind === 'one_time' ? 'onetime' : kind}` },
      )
    ).id

  const params: Stripe.PriceCreateParams = {
    product: productId,
    currency: SPONSOR_CURRENCY,
    unit_amount: spec.unitAmount,
    lookup_key: spec.lookupKey,
    transfer_lookup_key: true,
    nickname: spec.productName,
    metadata: { offering: spec.offeringId },
  }
  if (spec.interval) params.recurring = { interval: spec.interval, interval_count: 1 }
  const created = await stripe.prices.create(params, {
    idempotencyKey: `sponsor-price-${spec.lookupKey}-${spec.unitAmount}-${kind}`,
  })
  return created.id
}

export async function ensureSponsorPrice(stripe: Stripe, offering: SponsorOffering): Promise<string> {
  return ensureSponsorPriceSpec(stripe, sponsorPriceSpec(offering))
}

export function formatSponsorPriceLine(envName: string, priceId: string): string {
  if (!/^STRIPE_PRICE_[A-Z0-9_]+$/.test(envName)) throw new Error('unexpected price env')
  if (!/^price_[A-Za-z0-9_]+$/.test(priceId)) throw new Error('unexpected price id')
  return `${envName}=${priceId}`
}

/**
 * Creates or reuses test-mode Products and Prices. A matching one-time Price
 * is kept, and its Product name and statement descriptor are updated to
 * BestBotFor. Refuses live keys even when STRIPE_ALLOW_LIVE is true. Returns
 * env assignment lines and nothing else.
 */
export async function setupSponsorPrices(input: {
  key: string
  env?: Record<string, string | undefined>
  createStripe: (key: string) => Stripe
}): Promise<string[]> {
  assertTestSetupKey(input.key, input.env)
  const stripe = input.createStripe(input.key)
  const lines: string[] = []
  for (const spec of sponsorPriceSpecs()) {
    const priceId = await ensureSponsorPriceSpec(stripe, spec)
    lines.push(formatSponsorPriceLine(spec.priceEnv, priceId))
  }
  return lines
}
