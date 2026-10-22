import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { renderToStaticMarkup } from 'react-dom/server'

// Sentinel must-fix on #98: if a sixth founder still pays, the webhook keeps
// the row, flags it for an admin, and alerts. It never refunds.

let dbImpl: unknown = null
vi.mock('@/lib/db', async (original) => ({ ...(await original<Record<string, unknown>>()), getDb: () => dbImpl }))
vi.mock('@/lib/flags', async (original) => ({ ...(await original<Record<string, unknown>>()), adminSponsorsEnabled: () => true }))
vi.mock('@/lib/admin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requireAdmin: async () => ({ userId: 'user_admin' }),
  adminHomePath: () => '/admin/sponsors',
}))

import SponsorCardsPage from '@/app/admin/sponsors/page'
import { createTestDatabase } from '@/test/db'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { FOUNDING_CAP_ALERT_TAG } from './founding-cap-alert'
import { foundingFoundersOverCap, foundingSpotsTaken } from './sponsor-availability'
import { handleStripeWebhook } from './stripe-webhook'

const SECRET = ['whsec', 'recount', 'fake'].join('_')
const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 19, 14)
const PRICE_KEYS = { STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly', STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup' }
const ORIGINAL = Object.fromEntries(Object.keys(PRICE_KEYS).map((key) => [key, process.env[key]]))
const LINES = [
  { price: { id: 'price_e2e_founding_monthly' }, quantity: 1 },
  { price: { id: 'price_e2e_founding_setup' }, quantity: 1 },
]

afterEach(() => {
  vi.restoreAllMocks()
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function stub(events: Stripe.Event[]): Stripe {
  return {
    webhooks: {
      constructEvent(raw: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== SECRET) throw new Error('signature')
        const event = events.find((item) => JSON.stringify(item) === raw)
        if (!event) throw new Error('body')
        return event
      },
    },
    checkout: { sessions: { retrieve: async (id: string) => ({ id, subscription: `sub_${id}`, line_items: { data: LINES } }) } },
    subscriptions: {
      retrieve: async (id: string) => {
        const start = T0 / 1000
        return {
          id,
          status: 'trialing',
          start_date: start,
          trial_end: start + 14 * 86400,
          cancel_at: null,
          cancel_at_period_end: false,
          canceled_at: null,
          ended_at: null,
          metadata: { kind: 'sponsorship', offering: 'founding_sponsor', task_slug: 'coding' },
          items: { data: [{ price: { id: 'price_e2e_founding_monthly' }, quantity: 1, current_period_end: start + 14 * 86400 }] },
        }
      },
    },
  } as unknown as Stripe
}

function completed(sessionId: string, task: string, at: number): Stripe.Event {
  return {
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    created: Math.floor(at / 1000),
    livemode: false,
    data: {
      object: {
        id: sessionId,
        mode: 'subscription',
        payment_status: 'paid',
        subscription: `sub_${sessionId}`,
        customer: `cus_${sessionId}`,
        payment_intent: null,
        customer_email: 'buyer@example.com',
        amount_total: 9900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'founding_sponsor',
          email: 'buyer@example.com',
          company: 'Sixth Tools',
          task_slug: task,
          issue_date: '',
          price_id: 'price_e2e_founding_monthly',
          creative_id: '',
        },
      },
    },
  } as unknown as Stripe.Event
}

async function seedFounders(db: Database, count: number) {
  for (const [index, task] of ['writing', 'images', 'video', 'voice', 'music'].slice(0, count).entries()) {
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: `cs_test_paid_${index}`,
      offering: 'founding_sponsor',
      status: 'paid',
      taskSlug: task,
      company: `Founder ${index}`,
      createdAt: T0 - DAY,
      updatedAt: T0 - DAY,
      paidAt: T0 - DAY + index,
    })
  }
}

async function deliver(db: Database, event: Stripe.Event, now: number) {
  Object.assign(process.env, PRICE_KEYS)
  return handleStripeWebhook({ rawBody: JSON.stringify(event), signature: 'valid', db, stripe: stub([event]), secret: SECRET, now })
}

describe('founding recount at completion', () => {
  it('a 5th paid founder is recorded with no alert', async () => {
    const { db, close } = await createTestDatabase()
    await seedFounders(db, 4)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await deliver(db, completed('cs_test_fifth', 'coding', T0), T0)).status).toBe(200)
    expect(errors.mock.calls.filter((call) => call[0] === FOUNDING_CAP_ALERT_TAG)).toHaveLength(0)
    expect(await foundingFoundersOverCap(db)).toEqual([])
    await close()
  })

  it('a 6th paid founder is kept as paid (no refund), flagged over the cap, and alerted with no buyer details in the log', async () => {
    const { db, close } = await createTestDatabase()
    await seedFounders(db, 5)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await deliver(db, completed('cs_test_sixth', 'coding', T0), T0)
    expect(result.status).toBe(200)
    const alerts = errors.mock.calls.filter((call) => call[0] === FOUNDING_CAP_ALERT_TAG)
    expect(alerts).toHaveLength(1)
    const payload = JSON.parse(String(alerts[0]?.[1])) as Record<string, unknown>
    expect(payload).toMatchObject({ session: 'cs_test_sixth', paid_founders: 6, cap: 5 })
    expect(String(alerts[0]?.[1])).not.toContain('buyer@example.com')
    expect(String(alerts[0]?.[1])).not.toContain('Sixth Tools')
    // The row stays paid and unrefunded: Mark decides refund or honor.
    const row = (await db.$client.execute("SELECT status, refunded_at FROM sponsorships WHERE stripe_checkout_session_id = 'cs_test_sixth'")).rows[0]
    expect(row?.status).toBe('paid')
    expect(row?.refunded_at).toBeNull()
    expect(await foundingSpotsTaken(db, T0)).toBe(6)
    // The flag names the founder who paid after the first 5.
    expect((await foundingFoundersOverCap(db)).map((founder) => founder.sessionId)).toEqual(['cs_test_sixth'])
    await close()
  })

  it('a refund of an earlier founder clears the flag, since the paid founders are back to 5', async () => {
    const { db, close } = await createTestDatabase()
    await seedFounders(db, 5)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await deliver(db, completed('cs_test_sixth', 'coding', T0), T0)
    await db.$client.execute("UPDATE sponsorships SET refunded_at = 1 WHERE stripe_checkout_session_id = 'cs_test_paid_0'")
    expect(await foundingFoundersOverCap(db)).toEqual([])
    await close()
  })

  it('a failed recount is logged and does not fail the webhook', async () => {
    const { db, close } = await createTestDatabase()
    await seedFounders(db, 5)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = db.$client.execute.bind(db.$client)
    vi.spyOn(db.$client, 'execute').mockImplementation(((statement: Parameters<typeof original>[0]) => {
      const sql = typeof statement === 'string' ? statement : (statement as { sql: string }).sql
      if (sql.includes('ORDER BY coalesce(paid_at, 0) ASC')) return Promise.reject(Object.assign(new Error('down'), { name: 'LibsqlError' }))
      return original(statement)
    }) as typeof db.$client.execute)
    expect((await deliver(db, completed('cs_test_sixth', 'coding', T0), T0)).status).toBe(200)
    expect(errors.mock.calls.some((call) => call[0] === 'founding recount failed' && call[1] === 'cs_test_sixth')).toBe(true)
    await close()
  })
})

describe('/admin/sponsors founding cap flag', () => {
  it('shows "Founding cap exceeded" with the over-cap founder, and nothing at 5', async () => {
    const { db, close } = await createTestDatabase()
    dbImpl = db
    await seedFounders(db, 5)
    expect(renderToStaticMarkup(await SponsorCardsPage())).not.toContain('Founding cap exceeded')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await deliver(db, completed('cs_test_sixth', 'coding', T0), T0)
    const html = renderToStaticMarkup(await SponsorCardsPage())
    expect(html).toContain('Founding cap exceeded')
    expect(html).toContain('Nothing was refunded')
    expect(html).toContain('Mark decides to refund or honor each one')
    expect(html).toContain('Sixth Tools · /best/coding · cs_test_sixth')
    expect(html).not.toContain('Founder 4 · ')
    await close()
  })
})
