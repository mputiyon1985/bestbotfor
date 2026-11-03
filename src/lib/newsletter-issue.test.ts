import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createTestDatabase } from '@/test/db'
import { handleStripeWebhook } from './stripe-webhook'
import { sponsorships } from './db/schema'
import { NEWSLETTER_ISSUE_PASSED_ALERT_TAG, listPassedNewsletterIssues, newsletterPaidAfterIssue } from './newsletter-issue'

const SECRET = 'whsec_test_secret'
const NOW = Date.parse('2026-11-03T15:00:00Z')

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
          return { id, line_items: { data: [{ price: { id: 'price_e2e_newsletter' }, quantity: 1 }] } }
        },
      },
    },
  } as unknown as Stripe
}

function completed(sessionId: string, issueDate: string): Stripe.Event {
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
        customer_email: 'news@example.com',
        amount_total: 4900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'newsletter_slot',
          email: 'news@example.com',
          company: 'News Tools',
          task_slug: '',
          issue_date: issueDate,
          price_id: 'price_e2e_newsletter',
          creative_id: '',
        },
      },
    },
  } as unknown as Stripe.Event
}

describe('newsletter issue date', () => {
  it('is late only when the UTC day of payment is after the issue date', () => {
    const nov3 = Date.parse('2026-11-03T15:00:00Z')
    const nov10 = Date.parse('2026-11-10T15:00:00Z')
    const nov20 = Date.parse('2026-11-20T15:00:00Z')
    expect(newsletterPaidAfterIssue('2026-11-10', nov3)).toBe(false)
    expect(newsletterPaidAfterIssue('2026-11-10', nov10)).toBe(false)
    expect(newsletterPaidAfterIssue('2026-11-10', nov20)).toBe(true)
    expect(newsletterPaidAfterIssue('2026-11-02', NOW)).toBe(true)
    expect(newsletterPaidAfterIssue('2026-02-31', NOW)).toBe(false)
  })

  const original = process.env.STRIPE_PRICE_NEWSLETTER_SLOT
  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_PRICE_NEWSLETTER_SLOT
    else process.env.STRIPE_PRICE_NEWSLETTER_SLOT = original
  })

  it('flags a paid newsletter checkout whose issue date has already passed', async () => {
    process.env.STRIPE_PRICE_NEWSLETTER_SLOT = 'price_e2e_newsletter'
    const { db, close } = await createTestDatabase()
    const late = completed('cs_late_issue', '2026-10-01')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(late),
      signature: 'valid',
      db,
      stripe: stripeStub([late]),
      secret: SECRET,
      now: NOW,
    })
    expect(result.status).toBe(200)
    expect(error.mock.calls.some((call) => call[0] === NEWSLETTER_ISSUE_PASSED_ALERT_TAG)).toBe(true)
    const logged = String(error.mock.calls.find((call) => call[0] === NEWSLETTER_ISSUE_PASSED_ALERT_TAG)?.[1])
    expect(logged).toContain('cs_late_issue')
    expect(logged).toContain('2026-10-01')
    expect(logged).not.toContain('news@example.com')
    error.mockClear()
    const current = completed('cs_current_issue', '2026-11-03')
    await handleStripeWebhook({
      rawBody: JSON.stringify(current),
      signature: 'valid',
      db,
      stripe: stripeStub([late, current]),
      secret: SECRET,
      now: NOW,
    })
    expect(error.mock.calls.some((call) => call[0] === NEWSLETTER_ISSUE_PASSED_ALERT_TAG)).toBe(false)
    error.mockClear()
    const onTime = completed('cs_on_time', '2026-11-10')
    await handleStripeWebhook({
      rawBody: JSON.stringify(onTime),
      signature: 'valid',
      db,
      stripe: stripeStub([late, current, onTime]),
      secret: SECRET,
      now: NOW,
    })
    expect(error.mock.calls.some((call) => call[0] === NEWSLETTER_ISSUE_PASSED_ALERT_TAG)).toBe(false)
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_paid_on_time',
      offering: 'newsletter_slot',
      status: 'paid',
      issueDate: '2026-11-10',
      paidAt: Date.parse('2026-11-03T15:00:00Z'),
      createdAt: Date.parse('2026-11-03T15:00:00Z'),
      updatedAt: Date.parse('2026-11-03T15:00:00Z'),
    })
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_paid_late',
      offering: 'newsletter_slot',
      status: 'paid',
      issueDate: '2026-11-10',
      paidAt: Date.parse('2026-11-20T15:00:00Z'),
      createdAt: Date.parse('2026-11-20T15:00:00Z'),
      updatedAt: Date.parse('2026-11-20T15:00:00Z'),
    })
    const listed = await listPassedNewsletterIssues(db)
    expect(listed.map((row) => row.sessionId).sort()).toEqual(['cs_late_issue', 'cs_paid_late'])
    expect(listed.map((row) => row.sessionId)).not.toContain('cs_paid_on_time')
    expect(listed.map((row) => row.sessionId)).not.toContain('cs_on_time')
    await close()
  })
})
