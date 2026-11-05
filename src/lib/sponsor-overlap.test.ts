import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createTestDatabase } from '@/test/db'
import { sponsorships } from './db/schema'
import { handleStripeWebhook } from './stripe-webhook'
import { PLACEMENT_OVERLAP_ALERT_TAG, listPlacementOverlaps } from './sponsor-overlap'

const SECRET = 'whsec_test_secret'
const NOW = Date.parse('2026-11-03T12:00:00Z')

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
    checkout: {
      sessions: {
        async retrieve(id: string) {
          return { id, line_items: { data: [{ price: { id: 'price_e2e_weekly' }, quantity: 1 }] } }
        },
      },
    },
  } as unknown as Stripe
}

function completed(sessionId: string): Stripe.Event {
  return {
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    created: Math.floor(NOW / 1000),
    livemode: false,
    data: {
      object: {
        id: sessionId,
        mode: 'payment',
        payment_status: 'paid',
        customer_email: 'second@example.com',
        amount_total: 9900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'placement_weekly',
          email: 'second@example.com',
          company: 'Second Tools',
          task_slug: 'coding',
          issue_date: '',
          price_id: 'price_e2e_weekly',
          creative_id: '',
        },
      },
    },
  } as unknown as Stripe.Event
}

describe('placement overlap on completion', () => {
  const original = process.env.STRIPE_PRICE_PLACEMENT_WEEKLY

  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_PRICE_PLACEMENT_WEEKLY
    else process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = original
  })

  it('flags a paid placement that lands on a page that already has one, and lists it for admin', async () => {
    process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_e2e_weekly'
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_existing',
      offering: 'placement_weekly',
      status: 'paid',
      taskSlug: 'coding',
      company: 'First Tools',
      createdAt: NOW - 60_000,
      updatedAt: NOW - 60_000,
      paidAt: NOW - 60_000,
    })
    const event = completed('cs_second')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe: stripeStub([event]),
      secret: SECRET,
      now: NOW,
    })
    expect(result.status).toBe(200)
    expect(error.mock.calls.some((call) => call[0] === PLACEMENT_OVERLAP_ALERT_TAG)).toBe(true)
    const logged = String(error.mock.calls.find((call) => call[0] === PLACEMENT_OVERLAP_ALERT_TAG)?.[1])
    expect(logged).toContain('cs_second')
    expect(logged).toContain('cs_existing')
    expect(logged).not.toContain('second@example.com')
    const overlaps = await listPlacementOverlaps(db, NOW)
    expect(overlaps).toEqual([{ taskSlug: 'coding', sessionIds: ['cs_existing', 'cs_second'] }])
    await close()
  })
})
