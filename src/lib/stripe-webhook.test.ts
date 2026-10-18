import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { Database } from './db/client'
import { sponsorshipCreatives, sponsorships, stripeEvents, subscriptions } from './db/schema'
import { activeBestPlacementForTask } from './best-placement'
import { handleStripeWebhook, SPONSOR_REFUND_WEBHOOK_EVENTS } from './stripe-webhook'
import { createTestDatabase } from '@/test/db'

const SECRET = 'whsec_test_secret'
const SPONSOR_PRICE_ENV = {
  STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
  STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
  STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
} as const

const ORIGINAL_SPONSOR_ENV = Object.fromEntries(
  Object.keys(SPONSOR_PRICE_ENV).map((key) => [key, process.env[key]]),
) as Record<string, string | undefined>

function stripeStub(
  events: Stripe.Event[],
  options?: { priceId?: string; quantity?: number | null; onRetrieve?: () => void },
): Stripe {
  const priceId = options?.priceId ?? 'price_e2e_monthly'
  const quantity = options && 'quantity' in options ? options.quantity : 1
  return {
    webhooks: {
      constructEvent(rawBody: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== SECRET) throw new Error('invalid signature')
        const event = events.find((item) => JSON.stringify(item) === rawBody)
        if (!event) throw new Error('unknown body')
        return event
      },
    },
    checkout: {
      sessions: {
        async retrieve(id: string) {
          options?.onRetrieve?.()
          const item: { price: { id: string }; quantity?: number } = { price: { id: priceId } }
          if (typeof quantity === 'number') item.quantity = quantity
          return {
            id,
            line_items: { data: [item] },
          }
        },
      },
    },
  } as unknown as Stripe
}

function failFirstSubscriptionWrite(db: Database): Database {
  let failed = false
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'insert') {
        return (table: unknown) => {
          if (table === subscriptions && !failed) {
            failed = true
            return {
              values: () => ({
                onConflictDoUpdate: () => Promise.reject(new Error('transient write')),
              }),
            }
          }
          return target.insert.bind(target)(table as Parameters<Database['insert']>[0])
        }
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Database
}

function reportUnfinishedClaim(db: Database, eventId: string): Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'select') {
        return () => ({
          from: () => ({
            where: async () => [{ id: eventId, type: 'customer.subscription.updated', processedAt: 0 }],
          }),
        })
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as Database
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
  beforeEach(() => {
    for (const [key, value] of Object.entries(SPONSOR_PRICE_ENV)) process.env[key] = value
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_SPONSOR_ENV)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

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
      allowLive: false,
    })
    expect(result.status).toBe(400)
    expect(result.body.error).toBe('live-mode-rejected')
    expect(await db.select().from(subscriptions)).toEqual([])
    await close()
  })

  it('rejects a live-mode event when the flag is on outside exact production', async () => {
    const previousAllow = process.env.STRIPE_ALLOW_LIVE
    const previousVercel = process.env.VERCEL_ENV
    process.env.STRIPE_ALLOW_LIVE = ['tr', 'ue'].join('')
    const { db, close } = await createTestDatabase()
    try {
      const cases: Array<string | undefined> = [
        undefined,
        '',
        'preview',
        'development',
        'test',
        'Production',
        'PRODUCTION',
        ' production',
        'production ',
        'preview-branch',
      ]
      for (const [index, vercelEnv] of cases.entries()) {
        if (vercelEnv === undefined) delete process.env.VERCEL_ENV
        else process.env.VERCEL_ENV = vercelEnv
        const event = subscriptionEvent(`evt_live_env_${index}`, true)
        const result = await handleStripeWebhook({
          rawBody: JSON.stringify(event),
          signature: 'valid',
          db,
          stripe: stripeStub([event]),
          secret: SECRET,
        })
        expect(result.status, JSON.stringify(vercelEnv)).toBe(400)
        expect(result.body.error, JSON.stringify(vercelEnv)).toBe('live-mode-rejected')
      }
      expect(await db.select().from(subscriptions)).toEqual([])

      process.env.VERCEL_ENV = 'preview'
      const testEvent = subscriptionEvent('evt_test_preview', false)
      const applied = await handleStripeWebhook({
        rawBody: JSON.stringify(testEvent),
        signature: 'valid',
        db,
        stripe: stripeStub([testEvent]),
        secret: SECRET,
      })
      expect(applied).toEqual({ status: 200, body: { received: true } })
    } finally {
      if (previousAllow === undefined) delete process.env.STRIPE_ALLOW_LIVE
      else process.env.STRIPE_ALLOW_LIVE = previousAllow
      if (previousVercel === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousVercel
      await close()
    }
  })

  it('applies a live-mode subscription only for exact production with the flag on', async () => {
    const previousAllow = process.env.STRIPE_ALLOW_LIVE
    const previousVercel = process.env.VERCEL_ENV
    process.env.STRIPE_ALLOW_LIVE = ['tr', 'ue'].join('')
    process.env.VERCEL_ENV = 'production'
    const { db, close } = await createTestDatabase()
    try {
      const event = subscriptionEvent('evt_live_prod', true)
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
    } finally {
      if (previousAllow === undefined) delete process.env.STRIPE_ALLOW_LIVE
      else process.env.STRIPE_ALLOW_LIVE = previousAllow
      if (previousVercel === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousVercel
      await close()
    }
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

  it('records a sponsorship when tax makes the total differ from the list price', async () => {
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_sponsor_tax', 'checkout.session.completed', {
      amount_total: 32_000,
      metadata: {
        kind: 'sponsorship',
        offering: 'placement_monthly',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'coding',
        issue_date: '',
        price_id: 'price_from_metadata',
      },
    })
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
    expect(rows[0]).toMatchObject({
      stripePriceId: 'price_e2e_monthly',
      amountTotal: 32_000,
      status: 'paid',
    })
    await close()
  })

  it('does not store a sponsorship when the session price differs from the env price', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_price_mismatch')
    await expect(
      handleStripeWebhook({
        rawBody: JSON.stringify(event),
        signature: 'valid',
        db,
        stripe: stripeStub([event], { priceId: 'price_other' }),
        secret: SECRET,
      }),
    ).rejects.toThrow(/price mismatch/)
    expect(await db.select().from(sponsorships)).toEqual([])
    expect(await db.select().from(stripeEvents)).toEqual([])
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('sponsor@example.com')
    errorLog.mockRestore()
    await close()
  })

  it('does not store a sponsorship when the line quantity is not 1', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_quantity_mismatch')
    await expect(
      handleStripeWebhook({
        rawBody: JSON.stringify(event),
        signature: 'valid',
        db,
        stripe: stripeStub([event], { quantity: 2 }),
        secret: SECRET,
      }),
    ).rejects.toThrow(/quantity mismatch/)
    expect(await db.select().from(sponsorships)).toEqual([])
    expect(await db.select().from(stripeEvents)).toEqual([])
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('sponsor@example.com')
    errorLog.mockRestore()
    await close()
  })

  it('does not store a sponsorship when the line quantity is missing', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_quantity_missing')
    await expect(
      handleStripeWebhook({
        rawBody: JSON.stringify(event),
        signature: 'valid',
        db,
        stripe: stripeStub([event], { quantity: null }),
        secret: SECRET,
      }),
    ).rejects.toThrow(/quantity mismatch/)
    expect(await db.select().from(sponsorships)).toEqual([])
    expect(await db.select().from(stripeEvents)).toEqual([])
    errorLog.mockRestore()
    await close()
  })

  it('does not retrieve a session when the env price is missing', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.STRIPE_PRICE_PLACEMENT_MONTHLY
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_price_missing')
    let retrieved = 0
    await expect(
      handleStripeWebhook({
        rawBody: JSON.stringify(event),
        signature: 'valid',
        db,
        stripe: stripeStub([event], {
          onRetrieve: () => {
            retrieved += 1
          },
        }),
        secret: SECRET,
      }),
    ).rejects.toThrow(/not configured/)
    expect(retrieved).toBe(0)
    expect(await db.select().from(sponsorships)).toEqual([])
    expect(await db.select().from(stripeEvents)).toEqual([])
    errorLog.mockRestore()
    await close()
  })

  it('removes an unfinished claim when apply throws so the retry writes one row', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = subscriptionEvent('evt_retry_after_throw')
    const flaky = failFirstSubscriptionWrite(db)
    const input = {
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db: flaky,
      stripe: stripeStub([event]),
      secret: SECRET,
    }
    await expect(handleStripeWebhook(input)).rejects.toThrow(/transient write/)
    expect(await db.select().from(stripeEvents)).toEqual([])
    expect(await db.select().from(subscriptions)).toEqual([])
    const result = await handleStripeWebhook(input)
    expect(result).toEqual({ status: 200, body: { received: true } })
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_123'))
    expect(rows).toHaveLength(1)
    const saved = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id))
    expect(saved).toHaveLength(1)
    expect(saved[0]?.processedAt).toBeGreaterThan(0)
    errorLog.mockRestore()
    await close()
  })

  it('leaves a finished claim in place when apply fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const event = {
      id: 'evt_finished_guard',
      type: 'customer.subscription.updated',
      livemode: false,
      data: { object: { id: 'sub_finished_guard' } },
    } as unknown as Stripe.Event
    await db.insert(stripeEvents).values({ id: event.id, type: event.type, processedAt: 42 })
    await expect(
      handleStripeWebhook({
        rawBody: JSON.stringify(event),
        signature: 'valid',
        db: reportUnfinishedClaim(db, event.id),
        stripe: stripeStub([event]),
        secret: SECRET,
      }),
    ).rejects.toThrow(/subscription payload failed validation/)
    const saved = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id))
    expect(saved).toHaveLength(1)
    expect(saved[0]?.processedAt).toBe(42)
    expect(await db.select().from(subscriptions)).toEqual([])
    errorLog.mockRestore()
    await close()
  })

  it('sets paid_at once and does not move it when a later event updates the row', async () => {
    const { db, close } = await createTestDatabase()
    const paidAt = 1_700_000_000_000
    const later = paidAt + 60_000
    const pending = sponsorshipEvent('evt_clock_pending', 'checkout.session.completed', { payment_status: 'unpaid' })
    const paid = sponsorshipEvent('evt_clock_paid', 'checkout.session.async_payment_succeeded', { payment_status: 'paid' })
    const failed = sponsorshipEvent('evt_clock_failed', 'checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    const stripe = stripeStub([pending, paid, failed])
    await handleStripeWebhook({
      rawBody: JSON.stringify(pending),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: paidAt - 1,
    })
    const waiting = await db.select().from(sponsorships)
    expect(waiting[0]).toMatchObject({ status: 'pending', paidAt: null, refundedAt: null })
    await handleStripeWebhook({
      rawBody: JSON.stringify(paid),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: paidAt,
    })
    const active = await db.select().from(sponsorships)
    expect(active[0]).toMatchObject({ status: 'paid', paidAt, updatedAt: paidAt })
    await handleStripeWebhook({
      rawBody: JSON.stringify(failed),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: later,
    })
    const after = await db.select().from(sponsorships)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ status: 'paid', paidAt, updatedAt: later, refundedAt: null })
    await close()
  })

  it('stores a company name with bidi and control characters removed', async () => {
    const { db, close } = await createTestDatabase()
    const event = sponsorshipEvent('evt_company_bidi', 'checkout.session.completed', {
      metadata: {
        kind: 'sponsorship',
        offering: 'placement_monthly',
        email: 'sponsor@example.com',
        company: '\u202EExample\u0000 Tools',
        task_slug: 'coding',
        issue_date: '',
        price_id: 'price_e2e_monthly',
      },
    })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
    })
    expect(result.status).toBe(200)
    const rows = await db.select().from(sponsorships)
    expect(rows[0]?.company).toBe('Example Tools')
    await close()
  })

  it('sets refunded_at once for charge.refunded and a succeeded refund, and ignores a failed refund', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, close } = await createTestDatabase()
    const paidAt = 1_700_000_000_000
    const paid = sponsorshipEvent('evt_refund_paid')
    const stripe = stripeStub([paid])
    await handleStripeWebhook({
      rawBody: JSON.stringify(paid),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: paidAt,
    })
    const failedRefund = {
      id: 'evt_refund_failed',
      type: 'refund.failed',
      livemode: false,
      data: {
        object: {
          id: 're_failed',
          object: 'refund',
          payment_intent: 'pi_sponsor',
          status: 'failed',
          amount: 29_900,
          receipt_email: 'sponsor@example.com',
        },
      },
    } as unknown as Stripe.Event
    const partial = {
      id: 'evt_charge_refunded',
      type: 'charge.refunded',
      livemode: false,
      data: {
        object: {
          id: 'ch_sponsor',
          object: 'charge',
          payment_intent: 'pi_sponsor',
          refunded: false,
          amount_refunded: 1_000,
          billing_details: { email: 'sponsor@example.com', name: 'Example Tools' },
        },
      },
    } as unknown as Stripe.Event
    const again = {
      id: 'evt_refund_succeeded',
      type: 'refund.updated',
      livemode: false,
      data: {
        object: {
          id: 're_succeeded',
          object: 'refund',
          payment_intent: { id: 'pi_sponsor' },
          status: 'succeeded',
          amount: 29_900,
          receipt_email: 'sponsor@example.com',
        },
      },
    } as unknown as Stripe.Event
    const other = {
      id: 'evt_other_charge',
      type: 'charge.refunded',
      livemode: false,
      data: {
        object: {
          id: 'ch_other',
          object: 'charge',
          payment_intent: 'pi_other',
          refunded: true,
          amount_refunded: 29_900,
        },
      },
    } as unknown as Stripe.Event
    await handleStripeWebhook({
      rawBody: JSON.stringify(failedRefund),
      signature: 'valid',
      db,
      stripe: stripeStub([failedRefund]),
      secret: SECRET,
      now: paidAt + 1,
    })
    const stillPaid = await db.select().from(sponsorships)
    expect(stillPaid[0]).toMatchObject({ status: 'paid', paidAt, refundedAt: null })
    await handleStripeWebhook({
      rawBody: JSON.stringify(partial),
      signature: 'valid',
      db,
      stripe: stripeStub([partial]),
      secret: SECRET,
      now: paidAt + 2,
    })
    const refunded = await db.select().from(sponsorships)
    expect(refunded[0]).toMatchObject({ status: 'paid', paidAt, refundedAt: paidAt + 2, updatedAt: paidAt + 2 })
    await handleStripeWebhook({
      rawBody: JSON.stringify(again),
      signature: 'valid',
      db,
      stripe: stripeStub([again]),
      secret: SECRET,
      now: paidAt + 3,
    })
    await handleStripeWebhook({
      rawBody: JSON.stringify(other),
      signature: 'valid',
      db,
      stripe: stripeStub([other]),
      secret: SECRET,
      now: paidAt + 4,
    })
    const finalRows = await db.select().from(sponsorships)
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0]).toMatchObject({ status: 'paid', paidAt, refundedAt: paidAt + 2 })
    const logged = [...info.mock.calls, ...errorLog.mock.calls].flat().join(' ')
    expect(logged).not.toContain('sponsor@example.com')
    expect(logged).not.toContain('Example Tools')
    info.mockRestore()
    errorLog.mockRestore()
    await close()
  })

  it('hides a placement when refund.created succeeds, including a partial amount', async () => {
    expect(SPONSOR_REFUND_WEBHOOK_EVENTS).toEqual(['charge.refunded', 'refund.created', 'refund.updated'])
    const { db, close } = await createTestDatabase()
    const paid = sponsorshipEvent('evt_created_paid')
    const stripe = stripeStub([paid])
    await handleStripeWebhook({
      rawBody: JSON.stringify(paid),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 1_700_000_000_000,
    })
    const created = {
      id: 'evt_refund_created',
      type: 'refund.created',
      livemode: false,
      data: {
        object: {
          id: 're_created',
          object: 'refund',
          payment_intent: 'pi_sponsor',
          status: 'succeeded',
          amount: 100,
        },
      },
    } as unknown as Stripe.Event
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(created),
      signature: 'valid',
      db,
      stripe: stripeStub([created]),
      secret: SECRET,
      now: 1_700_000_000_500,
    })
    expect(result.status).toBe(200)
    const rows = await db.select().from(sponsorships)
    expect(rows[0]?.refundedAt).toBe(1_700_000_000_500)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await handleStripeWebhook({
      rawBody: JSON.stringify(created),
      signature: 'valid',
      db,
      stripe: stripeStub([created]),
      secret: SECRET,
      now: 1_700_000_000_600,
    })
    expect(info).not.toHaveBeenCalledWith('stripe webhook event', 'refund.created')
    info.mockRestore()
    await close()
  })

  it('links a checkout card and leaves it hidden until an admin approves it', async () => {
    const { db, close } = await createTestDatabase()
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const created = await db
      .insert(sponsorshipCreatives)
      .values({
        requestKey: 'req-card',
        toolName: 'Widget',
        description: 'A useful coding tool.',
        url: 'https://example.com/widget',
        logoMime: 'image/png',
        logoBytes: png,
        status: 'pending',
        createdAt: 1,
        updatedAt: 1,
      })
      .returning({ id: sponsorshipCreatives.id })
    const creativeId = created[0]?.id
    if (!creativeId) throw new Error('missing creative')
    const event = sponsorshipEvent('evt_sponsor_card', 'checkout.session.completed', {
      metadata: {
        kind: 'sponsorship',
        offering: 'placement_monthly',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'coding',
        issue_date: '',
        price_id: 'price_e2e_monthly',
        creative_id: String(creativeId),
      },
    })
    const now = 1_700_000_000_000
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
      now,
    })
    expect(result.status).toBe(200)
    const cards = await db.select().from(sponsorshipCreatives)
    const sponsorship = await db.select().from(sponsorships)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      status: 'pending',
      sponsorshipId: sponsorship[0]?.id,
      stripeCheckoutSessionId: 'cs_test_sponsor',
    })
    await expect(activeBestPlacementForTask(db, 'coding', now)).resolves.toBeNull()
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
