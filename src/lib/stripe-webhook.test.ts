import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { sponsorships, stripeEvents, subscriptions } from './db/schema'
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

function sponsorshipEvent(id: string, type = 'checkout.session.completed', overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id,
    type,
    livemode: false,
    data: {
      object: {
        id: 'cs_test_sponsor',
        mode: 'payment',
        payment_status: 'paid',
        customer: 'cus_sponsor',
        payment_intent: 'pi_sponsor',
        customer_email: 'sponsor@example.com',
        amount_total: 29900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'placement_monthly',
          email: 'sponsor@example.com',
          company: 'Example Tools',
          task_slug: 'coding',
          issue_date: '',
          price_id: 'price_e2e_monthly',
        },
        payment_method: { card: { number: '4242424242424242' } },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event
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

  it('applies the subscription when a previous claim was left unfinished', async () => {
    const { db, close } = await createTestDatabase()
    const event = subscriptionEvent('evt_unfinished')
    await db.insert(stripeEvents).values({ id: event.id, type: event.type, processedAt: 0 })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result).toEqual({ status: 200, body: { received: true } })
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_123'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ clerkUserId: 'user_1', status: 'active' })
    const saved = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id))
    expect(saved[0]?.processedAt).toBeGreaterThan(0)
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

  it('records a paid sponsorship once and ignores a duplicate delivery', async () => {
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_sponsor_once')
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
    const rows = await db.select().from(sponsorships)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      stripeCheckoutSessionId: 'cs_test_sponsor',
      stripePaymentIntentId: 'pi_sponsor',
      stripeCustomerId: 'cus_sponsor',
      stripePriceId: 'price_e2e_monthly',
      offering: 'placement_monthly',
      status: 'paid',
      email: 'sponsor@example.com',
      company: 'Example Tools',
      taskSlug: 'coding',
      amountTotal: 29900,
      currency: 'usd',
    })
    expect(JSON.stringify(rows[0])).not.toContain('4242424242424242')
    await close()
  })

  it('keeps an unpaid checkout pending until the async payment succeeds', async () => {
    const { db, close } = await createTestDatabase()
    const pending = sponsorshipEvent('evt_sponsor_pending', 'checkout.session.completed', { payment_status: 'unpaid' })
    const paid = sponsorshipEvent('evt_sponsor_paid', 'checkout.session.async_payment_succeeded', { payment_status: 'paid' })
    const stripe = stripeStub([pending, paid])
    await handleStripeWebhook({ rawBody: JSON.stringify(pending), signature: 'valid', db, stripe, secret: SECRET })
    const midway = await db.select().from(sponsorships)
    expect(midway).toHaveLength(1)
    expect(midway[0]?.status).toBe('pending')
    const result = await handleStripeWebhook({ rawBody: JSON.stringify(paid), signature: 'valid', db, stripe, secret: SECRET })
    expect(result.status).toBe(200)
    const rows = await db.select().from(sponsorships)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('paid')
    await close()
  })

  it('marks a sponsorship failed when the async payment fails', async () => {
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_sponsor_failed', 'checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result.status).toBe(200)
    const rows = await db.select().from(sponsorships)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('failed')
    await close()
  })

  it('logs an unknown event by type only', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = {
      id: 'evt_unknown',
      type: 'payment_intent.succeeded',
      livemode: false,
      data: { object: { id: 'pi_unknown', email: 'person-unknown@example.com' } },
    } as unknown as Stripe.Event
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(info).toHaveBeenCalledWith('stripe webhook event', 'payment_intent.succeeded')
    expect(info.mock.calls.flat().map(String).join(' ')).not.toContain('person-unknown@example.com')
    expect(await db.select().from(sponsorships)).toEqual([])
    info.mockRestore()
    await close()
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
