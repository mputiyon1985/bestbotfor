import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { SPONSOR_BUSINESS_NAME, SPONSOR_OFFERINGS, SPONSOR_ONE_TIME_NOTICE } from './sponsor-offerings'
import { ensureSponsorPrice, setupSponsorPrices } from './sponsor-setup'

const testKey = ['sk', 'test', 'example'].join('_')

function fakeStripe(prices: Array<Record<string, unknown>>, productRecords: Array<Record<string, unknown>> = []) {
  const created: Array<Record<string, unknown>> = []
  const priceKeys: string[] = []
  const products: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  const stripe = {
    prices: {
      list: async (params: { lookup_keys?: string[] }) => ({
        data: prices.filter((price) => !params.lookup_keys || params.lookup_keys.includes(String(price.lookup_key))),
      }),
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        created.push(params)
        priceKeys.push(options?.idempotencyKey ?? '')
        return { id: 'price_created' }
      },
    },
    products: {
      create: async (params: Record<string, unknown>) => {
        products.push(params)
        return { id: 'prod_created' }
      },
      retrieve: async (id: string) => {
        const found = productRecords.find((product) => product.id === id)
        if (!found) throw new Error(`missing product ${id}`)
        return found
      },
      update: async (id: string, params: Record<string, unknown>) => {
        updates.push({ id, ...params })
        return { id, ...params }
      },
    },
  }
  return { stripe: stripe as unknown as Stripe, created, products, updates, priceKeys }
}

describe('sponsor price setup', () => {
  it('reuses a price with the same lookup key and amount', async () => {
    const offering = SPONSOR_OFFERINGS[0]
    const { stripe, created, products, updates } = fakeStripe([
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
    expect(updates).toEqual([])
  })

  it('renames the product on a matching one-time price', async () => {
    const offering = SPONSOR_OFFERINGS[0]
    const { stripe, created, updates } = fakeStripe(
      [
        {
          id: 'price_existing',
          lookup_key: offering.lookupKey,
          unit_amount: offering.unitAmount,
          currency: 'usd',
          active: true,
          product: 'prod_old',
        },
      ],
      [{ id: 'prod_old', name: 'Featured placement, one week', statement_descriptor: 'Featured placement' }],
    )
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_existing')
    expect(created).toEqual([])
    expect(updates).toEqual([{ id: 'prod_old', name: 'BestBotFor', statement_descriptor: 'BestBotFor' }])
  })

  it('leaves a product that is already named BestBotFor', async () => {
    const offering = SPONSOR_OFFERINGS[1]
    const { stripe, created, updates } = fakeStripe(
      [
        {
          id: 'price_existing',
          lookup_key: offering.lookupKey,
          unit_amount: offering.unitAmount,
          currency: 'usd',
          active: true,
          product: { id: 'prod_ready' },
        },
      ],
      [{ id: 'prod_ready', name: 'BestBotFor', statement_descriptor: 'BestBotFor' }],
    )
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_existing')
    expect(created).toEqual([])
    expect(updates).toEqual([])
  })

  it('keeps a matching price when its product was deleted', async () => {
    const offering = SPONSOR_OFFERINGS[2]
    const { stripe, created, updates } = fakeStripe(
      [
        {
          id: 'price_existing',
          lookup_key: offering.lookupKey,
          unit_amount: offering.unitAmount,
          currency: 'usd',
          active: true,
          product: 'prod_gone',
        },
      ],
      [{ id: 'prod_gone', deleted: true }],
    )
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_existing')
    expect(created).toEqual([])
    expect(updates).toEqual([])
  })

  it('creates a product and price when the lookup key is missing', async () => {
    const offering = SPONSOR_OFFERINGS[2]
    const { stripe, created, products, priceKeys } = fakeStripe([])
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_created')
    expect(products[0]).toMatchObject({
      name: SPONSOR_BUSINESS_NAME,
      description: `Newsletter sponsor slot. ${SPONSOR_ONE_TIME_NOTICE}`,
      statement_descriptor: SPONSOR_BUSINESS_NAME,
    })
    expect(products[0]).not.toHaveProperty('tax_code')
    expect(created[0]).not.toHaveProperty('tax_behavior')
    expect(created[0]).not.toHaveProperty('recurring')
    expect(created[0]).toMatchObject({
      unit_amount: 4_900,
      currency: 'usd',
      lookup_key: 'sponsor_newsletter_issue',
      transfer_lookup_key: true,
      nickname: 'Newsletter sponsor slot',
    })
    expect(priceKeys[0]).toBe('sponsor-price-sponsor_newsletter_issue-4900-one_time')
  })

  it('creates one-time week and month prices with no recurring interval', async () => {
    const weekly = SPONSOR_OFFERINGS[0]
    const monthly = SPONSOR_OFFERINGS[1]
    const week = fakeStripe([])
    const month = fakeStripe([])
    await ensureSponsorPrice(week.stripe, weekly)
    await ensureSponsorPrice(month.stripe, monthly)
    expect(week.created[0]).toMatchObject({ unit_amount: 9_900, nickname: 'Featured placement, one week' })
    expect(week.created[0]).not.toHaveProperty('recurring')
    expect(week.priceKeys[0]).toBe('sponsor-price-sponsor_best_placement_weekly-9900-one_time')
    expect(month.priceKeys[0]).toBe('sponsor-price-sponsor_best_placement_monthly-29900-one_time')
    expect(month.created[0]).toMatchObject({ unit_amount: 29_900, nickname: 'Featured placement, one month' })
    expect(month.created[0]).not.toHaveProperty('recurring')
    expect(week.products[0]).toMatchObject({
      name: 'BestBotFor',
      description: 'Featured placement, one week. One-time payment, no auto-renewal.',
      statement_descriptor: 'BestBotFor',
    })
    expect(month.products[0]).toMatchObject({
      description: 'Featured placement, one month. One-time payment, no auto-renewal.',
    })
  })

  it('does not reuse a recurring price with the same amount', async () => {
    const offering = SPONSOR_OFFERINGS[0]
    const { stripe, created } = fakeStripe([
      {
        id: 'price_recurring',
        lookup_key: offering.lookupKey,
        unit_amount: offering.unitAmount,
        currency: 'usd',
        active: true,
        recurring: { interval: 'week' },
        product: 'prod_existing',
      },
    ])
    await expect(ensureSponsorPrice(stripe, offering)).resolves.toBe('price_created')
    expect(created[0]).toMatchObject({ unit_amount: 9_900, product: 'prod_existing' })
    expect(created[0]).not.toHaveProperty('recurring')
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
