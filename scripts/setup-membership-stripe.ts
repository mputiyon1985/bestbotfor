/**
 * Creates (or reuses) the TEST-MODE membership product, prices and founding coupon.
 * Refuses any live key (assertTestSetupKey ignores STRIPE_ALLOW_LIVE).
 * Prints the env lines to paste into a preview / local env. Never writes env files.
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-membership-stripe.ts
 */
import Stripe from 'stripe'
import { assertTestSetupKey, STRIPE_API_VERSION } from '../src/lib/stripe-key'

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
assertTestSetupKey(key, process.env)
const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })

const PRODUCT_KEY = 'bbf_membership'
const PRICES = [
  { lookup: 'bbf_member_annual_2900', amount: 2900, interval: 'year' as const, env: 'STRIPE_PRICE_MEMBER_ANNUAL' },
  { lookup: 'bbf_member_monthly_400', amount: 400, interval: 'month' as const, env: 'STRIPE_PRICE_MEMBER_MONTHLY' },
]
const COUPON_ID = 'bbf_founding_19_first_year'

async function main() {
  const found = await stripe.products.search({ query: `metadata['bbf_key']:'${PRODUCT_KEY}'` })
  const product =
    found.data[0] ??
    (await stripe.products.create({ name: 'BestBotFor Membership', metadata: { bbf_key: PRODUCT_KEY } }))
  if (product.livemode) throw new Error('live object returned; aborting')
  const lines: string[] = []
  for (const spec of PRICES) {
    const existing = await stripe.prices.list({ lookup_keys: [spec.lookup], limit: 1 })
    const price =
      existing.data[0] ??
      (await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: spec.amount,
        recurring: { interval: spec.interval },
        lookup_key: spec.lookup,
      }))
    if (price.unit_amount !== spec.amount || price.recurring?.interval !== spec.interval) throw new Error(`${spec.lookup} mismatch`)
    lines.push(`${spec.env}=${price.id}`)
  }
  let coupon: Stripe.Coupon
  try {
    coupon = await stripe.coupons.retrieve(COUPON_ID)
  } catch {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      name: 'Founding member: $19 first year',
      amount_off: 1000,
      currency: 'usd',
      duration: 'once',
      max_redemptions: 100,
      applies_to: { products: [product.id] },
    })
  }
  lines.push(`STRIPE_COUPON_FOUNDING=${coupon.id}`)
  console.log(lines.join('\n'))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
