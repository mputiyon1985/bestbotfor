import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { SPONSOR_OFFERINGS } from './sponsor-offerings'
import { ensureSponsorPrice, setupSponsorPrices } from './sponsor-setup'

const testKey = ['sk', 'test', 'example'].join('_')

function fakeStripe(prices: Array<Record<string, unknown>>) {
  const created: Array<Record<string, unknown>> = []
  const products: Array<Record<string, unknown>> = []
  const stripe = {
    prices: {
      list: async (params: { lookup_keys?: string[] }) => ({
        data: prices.filter((price) => !params.lookup_keys || params.lookup_keys.includes(String(price.lookup_key))),
      }),
      create: async (params: Record<string, unknown>) => {
        created.push(params)
        return { id: 'price_created' }
      },
    },
    products: {
      create: async (params: Record<string, unknown>) => {
        products.push(params)
        return { id: 'prod_created' }
      },
    },
  }
  return { stripe: stripe as unknown as Stripe, created, products }
}

describe('sponsor price setup', () => {
  it('reuses a price with the same lookup key and amount', async () => {
    const offering = SPONSOR_OFFERINGS[0]
    const { stripe, created, products } = fakeStripe([
      {
        id: 'price_existing',
        lookup_key: offering.lookupKey,
        unit_amount: offering.unitAmount,
        currency: 'usd',
        active: true,
      },
    ])
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_existing')
    expect(created).toEqual([])
    expect(products).toEqual([])
  })

  it('creates a product and price when the lookup key is missing', async () => {
    const offering = SPONSOR_OFFERINGS[2]
    const { stripe, created, products } = fakeStripe([])
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_created')
    expect(products[0]).toMatchObject({ name: offering.productName })
    expect(created[0]).toMatchObject({
      unit_amount: 4_900,
      currency: 'usd',
      lookup_key: 'sponsor_newsletter_issue',
      transfer_lookup_key: true,
    })
  })

  it('moves the lookup key when the configured amount changed', async () => {
    const offering = SPONSOR_OFFERINGS[1]
    const { stripe, created, products } = fakeStripe([
      {
        id: 'price_old',
        lookup_key: offering.lookupKey,
        unit_amount: 1,
        currency: 'usd',
        active: true,
        product: 'prod_existing',
      },
    ])
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_created')
    expect(products).toEqual([])
    expect(created[0]).toMatchObject({
      product: 'prod_existing',
      unit_amount: 29_900,
      lookup_key: 'sponsor_best_placement_monthly',
      transfer_lookup_key: true,
    })
  })

  it('prints only price ids', async () => {
    const prices = SPONSOR_OFFERINGS.map((offering, index) => ({
      id: `price_ready_${index}`,
      lookup_key: offering.lookupKey,
      unit_amount: offering.unitAmount,
      currency: 'usd',
      active: true,
    }))
    const { stripe } = fakeStripe(prices)
    const lines = await setupSponsorPrices({
      key: testKey,
      env: { STRIPE_ALLOW_LIVE: 'true' },
      createStripe: () => stripe,
    })
    expect(lines).toEqual([
      'STRIPE_PRICE_PLACEMENT_WEEKLY=price_ready_0',
      'STRIPE_PRICE_PLACEMENT_MONTHLY=price_ready_1',
      'STRIPE_PRICE_NEWSLETTER_SLOT=price_ready_2',
    ])
    expect(lines.join('\n')).not.toContain(testKey)
  })
})
