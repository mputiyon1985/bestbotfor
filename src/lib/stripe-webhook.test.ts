import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { stripeEvents, subscriptions } from './db/schema'
import { handleStripeWebhook } from './stripe-webhook'
import { createTestDatabase } from '@/test/db'

const SECRET = 'whsec_test_secret'

function stripeStub(events: Stripe.Event[]): Stripe {
  return {
    webhooks: {
      constructEvent(rawBody: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== SECRET) throw new Error('invalid signature')
        const event = events.find((item) => JSON.stringify(item) === rawBody)
        if (!event) throw new Error('unknown body')
        return event
      },
    },
  } as unknown as Stripe
}

function subscriptionEvent(id: string, livemode = false): Stripe.Event {
  return {
    id,
    type: 'customer.subscription.updated',
    livemode,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        metadata: { clerkUserId: 'user_1' },
        items: { data: [{ price: { id: 'price_123' }, current_period_end: 1_900_000_000 }] },
      },
    },
  } as unknown as Stripe.Event
}

describe('handleStripeWebhook', () => {
  it('rejects a bad signature before writing anything', async () => {
    const { db, close } = await createTestDatabase()
    const event = subscriptionEvent('evt_bad')
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'nope',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result).toEqual({ status: 400, body: { error: 'invalid-signature' } })
    expect(await db.select().from(stripeEvents)).toEqual([])
    await close()
  })

  it('rejects a live-mode event', async () => {
    const { db, close } = await createTestDatabase()
    const event = subscriptionEvent('evt_live', true)
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('live-mode-rejected')
    expect(await db.select().from(subscriptions)).toEqual([])
    await close()
  })

  it('applies a test subscription once and treats the retry as a duplicate', async () => {
    const { db, close } = await createTestDatabase()
    const event = subscriptionEvent('evt_once')
    const input = {
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    }
    const first = await handleStripeWebhook(input)
    const second = await handleStripeWebhook(input)
    expect(first).toEqual({ status: 200, body: { received: true } })
    expect(second).toEqual({ status: 200, body: { received: true, duplicate: true } })
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_123'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      clerkUserId: 'user_1',
      stripeCustomerId: 'cus_123',
      status: 'active',
      stripePriceId: 'price_123',
    })
    await close()
  })

  it('records a subscription when a delayed checkout payment succeeds', async () => {
    const { db, close } = await createTestDatabase()
    const event = {
      id: 'evt_async',
      type: 'checkout.session.async_payment_succeeded',
      livemode: false,
      data: {
        object: {
          mode: 'subscription',
          customer: 'cus_async',
          subscription: 'sub_async',
          metadata: { clerkUserId: 'user_async' },
        },
      },
    } as unknown as Stripe.Event
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result.status).toBe(200)
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_async'))
    expect(rows[0]).toMatchObject({ clerkUserId: 'user_async', status: 'active', stripeCustomerId: 'cus_async' })
    await close()
  })

  it('keeps the clerk user when a later event omits metadata', async () => {
    const { db, close } = await createTestDatabase()
    const first = subscriptionEvent('evt_user')
    const second = {
      ...subscriptionEvent('evt_later'),
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_123' }, current_period_end: 1_900_000_000 }] },
        },
      },
    } as unknown as Stripe.Event
    await handleStripeWebhook({
      rawBody: JSON.stringify(first),
      signature: 'valid',
      db,
      stripe: stripeStub([first, second]),
      secret: SECRET,
    })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(second),
      signature: 'valid',
      db,
      stripe: stripeStub([first, second]),
      secret: SECRET,
    })
    expect(result.status).toBe(200)
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_123'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ clerkUserId: 'user_1', status: 'past_due' })
    await close()
  })

  it('returns before a stuck database write and does not answer 503', async () => {
    const event = subscriptionEvent('evt_hang')
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => new Promise(() => {}),
          }),
        }),
      }),
    } as unknown as Parameters<typeof handleStripeWebhook>[0]['db']
    const started = Date.now()
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
      deadlineMs: 40,
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(result.status).toBe(500)
    expect(result.status).not.toBe(503)
    expect(result.body.error).toBe('webhook-timeout')
  })

  it('reports billing as disabled when Stripe is not passed in', async () => {
    const { db, close } = await createTestDatabase()
    const result = await handleStripeWebhook({
      rawBody: '{}',
      signature: 'valid',
      db,
      stripe: null,
      secret: null,
    })
    expect(result).toEqual({ status: 503, body: { error: 'billing-disabled' } })
    await close()
  })
})
