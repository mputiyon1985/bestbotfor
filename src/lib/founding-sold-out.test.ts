import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type Stripe from 'stripe'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { createTestDatabase } from '@/test/db'
import { resetDbCache } from './db'
import * as schema from './db/schema'
import { sponsorships } from './db/schema'
import { FOUNDING_LINK_KEY_PREFIX, claimSponsorSlot, foundingSoldOutNow, foundingSpotsLeft } from './sponsor-availability'
import {
  FOUNDING_SOLD_OUT,
  FOUNDING_SPONSOR_CAP,
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_FOUNDING_SOLD_OUT_NOTICE,
  SPONSOR_OFFERING_NOT_CONFIGURED,
  SPONSOR_SOLD_OUT_LABEL,
} from './sponsor-offerings'
import { resetStripeCache } from './stripe'
import { handleStripeWebhook } from './stripe-webhook'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 9, 19, 14) // Oct 19, 2026 10:00 AM ET
const T0S = T0 / 1000
const SECRET = 'whsec_test_secret'
const testKey = ['sk', 'test', 'example'].join('_')
const OTHER_TASKS = ['writing', 'image', 'video', 'voice', 'music', 'research']

const ENV: Record<string, string> = {
  VERCEL_ENV: 'preview',
  STRIPE_SECRET_KEY: testKey,
  STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
  STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
  STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
  STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly',
  STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup',
}
const ENV_KEYS = [...Object.keys(ENV), 'STRIPE_ALLOW_LIVE', 'STRIPE_PRICE_PLACEMENT_SUBSCRIPTION', 'TURSO_DATABASE_URL']
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) process.env[key] = value
  delete process.env.STRIPE_ALLOW_LIVE
  delete process.env.STRIPE_PRICE_PLACEMENT_SUBSCRIPTION
})

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetDbCache()
  resetStripeCache()
  vi.restoreAllMocks()
})

/** A paid, unrefunded in-app founding sponsor on a task page. */
async function paidFounder(db: TestDb['db'], task: string, index: number): Promise<void> {
  await db.insert(sponsorships).values({
    stripeCheckoutSessionId: `cs_founder_${index}`,
    offering: 'founding_sponsor',
    status: 'paid',
    taskSlug: task,
    createdAt: T0 - DAY,
    updatedAt: T0 - DAY,
    paidAt: T0 - DAY,
    stripeSubscriptionId: `sub_founder_${index}`,
    subscriptionStatus: 'trialing',
    paidThrough: T0 + 13 * DAY,
  })
}

/** Render /sponsor against this test database, the way production reads it. */
async function sponsorHtml(url: string): Promise<string> {
  process.env.TURSO_DATABASE_URL = url
  resetDbCache()
  resetStripeCache()
  return renderToStaticMarkup(await SponsorPage())
}

function foundingRadio(html: string): string {
  const radio = html.match(/<input[^>]*value="founding_sponsor"[^>]*>/)?.[0]
  if (!radio) throw new Error('founding radio missing')
  return radio
}

const isDisabled = (radio: string) => /\sdisabled=""/.test(radio)

describe('founding sold-out auto-hide', () => {
  it('4/5 taken: the founding option stays open on /sponsor and a checkout can hold the last spot', async () => {
    const { db, url, close }: TestDb = await createTestDatabase()
    for (const [index, task] of OTHER_TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    expect(await foundingSpotsLeft(db, T0)).toBe(1)
    expect(await foundingSoldOutNow(T0, db)).toBe(false)

    const html = await sponsorHtml(url)
    expect(isDisabled(foundingRadio(html))).toBe(false)
    expect(html).not.toContain(SPONSOR_SOLD_OUT_LABEL)
    expect(html).not.toContain(SPONSOR_FOUNDING_SOLD_OUT_NOTICE)
    expect(html).toContain('Founding sponsor: $99 for 2 weeks, then $299/mo')
    expect(html).toContain(SPONSOR_FOUNDING_NOTICE)

    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-5', now: T0 })).toMatchObject({ ok: true })
    await close()
  })

  it('5/5 taken: /sponsor renders the founding option disabled and labeled Sold out, and the checkout claim refuses it', async () => {
    const { db, url, close }: TestDb = await createTestDatabase()
    for (const [index, task] of OTHER_TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    // The fifth spot is a founding Payment Link sale recorded as a manual first-period row.
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: `${FOUNDING_LINK_KEY_PREFIX}cs_link_5`,
      stripePaymentIntentId: 'pi_link_5',
      offering: 'placement_monthly',
      status: 'paid',
      taskSlug: 'research',
      createdAt: T0 - DAY,
      updatedAt: T0 - DAY,
      paidAt: T0 - DAY,
    })
    expect(await foundingSpotsLeft(db, T0)).toBe(0)
    expect(await foundingSoldOutNow(T0, db)).toBe(true)

    const html = await sponsorHtml(url)
    const radio = foundingRadio(html)
    expect(isDisabled(radio)).toBe(true)
    expect(html).toContain(`Founding sponsor · ${SPONSOR_SOLD_OUT_LABEL}`)
    expect(html).toContain(SPONSOR_FOUNDING_SOLD_OUT_NOTICE)
    expect(html).toContain(`Founding sponsor: ${SPONSOR_SOLD_OUT_LABEL}. All ${FOUNDING_SPONSOR_CAP} founding sponsor spots are taken.`)
    // A sold-out option names no price or terms anywhere on the page.
    expect(html).not.toContain('$99 for 2 weeks')
    expect(html).not.toContain(SPONSOR_FOUNDING_NOTICE)
    // Sold out is not "not configured": the founding Payment Link stays hidden too.
    expect(html).not.toContain('Become a founding sponsor')
    // The other offers are unaffected.
    expect(isDisabled(html.match(/<input[^>]*value="placement_weekly"[^>]*>/)?.[0] ?? '')).toBe(false)
    expect(html.match(new RegExp(SPONSOR_OFFERING_NOT_CONFIGURED.replace(/\./g, '\\.'), 'g'))?.length ?? 0).toBe(0) // the unconfigured monthly subscription is hidden, not labeled

    // Server side: a new founding checkout is refused before any Stripe session.
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-6', now: T0 })).toEqual({
      ok: false,
      message: FOUNDING_SOLD_OUT,
    })
    // A one-time placement on the same page is still sold.
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-w', now: T0 })).toMatchObject({ ok: true })
    await close()
  })

  it('race at 4/5: two concurrent founding checkouts on separate connections, exactly one gets the last spot', async () => {
    const { db, url, close }: TestDb = await createTestDatabase()
    for (const [index, task] of OTHER_TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    const clientA = createClient({ url })
    const clientB = createClient({ url })
    await clientA.execute('PRAGMA busy_timeout = 5000')
    await clientB.execute('PRAGMA busy_timeout = 5000')
    const dbA = drizzle(clientA, { schema })
    const dbB = drizzle(clientB, { schema })
    const results = await Promise.all([
      claimSponsorSlot(dbA, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-a', now: T0 }),
      claimSponsorSlot(dbB, { taskSlug: 'chat', offering: 'founding_sponsor', requestKey: 'req-b', now: T0 }),
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, message: FOUNDING_SOLD_OUT }])
    expect(await foundingSpotsLeft(db, T0 + 1)).toBe(0)
    expect(await foundingSoldOutNow(T0 + 1, db)).toBe(true)
    clientA.close()
    clientB.close()
    await close()
  })

  it('rule F: refunding the fifth founder\'s first period through the webhook frees the spot and reopens /sponsor', async () => {
    const { db, url, close }: TestDb = await createTestDatabase()
    for (const [index, task] of OTHER_TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    const completed = checkoutCompleted()
    const refunded = {
      id: 'evt_refund_first',
      type: 'charge.refunded',
      created: T0S + 3600,
      livemode: false,
      data: {
        object: {
          id: 'ch_first',
          object: 'charge',
          refunded: true,
          amount_refunded: 9_900,
          payment_intent: 'pi_first_invoice',
          customer: 'cus_fifth',
        },
      },
    } as unknown as Stripe.Event
    const stripe = webhookStripe([completed, refunded])
    const send = (event: Stripe.Event, now: number) =>
      handleStripeWebhook({ rawBody: JSON.stringify(event), signature: 'valid', db, stripe, secret: SECRET, now })

    expect(await send(completed, T0)).toEqual({ status: 200, body: { received: true } })
    expect(await foundingSpotsLeft(db, T0 + 1)).toBe(0)
    expect(isDisabled(foundingRadio(await sponsorHtml(url)))).toBe(true)

    expect(await send(refunded, T0 + 3_600_000)).toEqual({ status: 200, body: { received: true } })
    const fifth = (await db.select().from(sponsorships)).find((row) => row.stripeSubscriptionId === 'sub_fifth')
    expect(fifth?.refundedAt).toBe(T0 + 3_600_000)
    expect(await foundingSpotsLeft(db, T0 + 3_600_001)).toBe(1)
    const reopened = await sponsorHtml(url)
    expect(isDisabled(foundingRadio(reopened))).toBe(false)
    expect(reopened).not.toContain(SPONSOR_SOLD_OUT_LABEL)
    expect(await claimSponsorSlot(db, { taskSlug: 'chat', offering: 'founding_sponsor', requestKey: 'req-next', now: T0 + 3_600_001 })).toMatchObject({ ok: true })
    await close()
  })

  it('a failed availability read logs only the error name and leaves the option open; the claim still decides', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken = {
      $client: {
        execute: async () => {
          throw new TypeError('database unavailable at libsql://secret-host')
        },
      },
    } as unknown as TestDb['db']
    expect(await foundingSoldOutNow(T0, broken)).toBe(false)
    expect(errors).toHaveBeenCalledWith('founding availability read failed', 'TypeError')
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-host')
  })

  it('reads the database only when the founding offer could be bought', async () => {
    delete process.env.STRIPE_PRICE_FOUNDING_SETUP
    // No TURSO_DATABASE_URL: a database read here would throw and log.
    delete process.env.TURSO_DATABASE_URL
    resetDbCache()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const html = renderToStaticMarkup(await SponsorPage())
    expect(isDisabled(foundingRadio(html))).toBe(true)
    expect(html).not.toContain(SPONSOR_SOLD_OUT_LABEL)
    expect(errors).not.toHaveBeenCalled()
  })
})

function checkoutCompleted(): Stripe.Event {
  return {
    id: 'evt_fifth_checkout',
    type: 'checkout.session.completed',
    created: T0S,
    livemode: false,
    data: {
      object: {
        id: 'cs_test_fifth',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_fifth',
        customer: 'cus_fifth',
        payment_intent: null,
        customer_email: 'fifth@example.com',
        amount_total: 9_900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'founding_sponsor',
          email: 'fifth@example.com',
          company: 'Fifth Tools',
          task_slug: 'coding',
          issue_date: '',
          price_id: 'price_e2e_founding_monthly',
          creative_id: '',
        },
      },
    },
  } as unknown as Stripe.Event
}

/** The Stripe calls the founding checkout and its first-period refund make, stubbed. */
function webhookStripe(events: Stripe.Event[]): Stripe {
  const trialEnd = T0S + 14 * 86_400
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
          return {
            id,
            subscription: 'sub_fifth',
            line_items: {
              data: [
                { price: { id: 'price_e2e_founding_monthly' }, quantity: 1 },
                { price: { id: 'price_e2e_founding_setup' }, quantity: 1 },
              ],
            },
          }
        },
      },
    },
    subscriptions: {
      async retrieve(id: string) {
        return {
          id,
          status: 'trialing',
          start_date: T0S,
          trial_end: trialEnd,
          cancel_at: null,
          cancel_at_period_end: false,
          canceled_at: null,
          ended_at: null,
          metadata: { kind: 'sponsorship', offering: 'founding_sponsor', task_slug: 'coding' },
          items: { data: [{ price: { id: 'price_e2e_founding_monthly' }, quantity: 1, current_period_end: trialEnd }] },
        }
      },
    },
    invoicePayments: {
      async list(params: { payment?: { payment_intent?: string } }) {
        return { data: params.payment?.payment_intent === 'pi_first_invoice' ? [{ id: 'inpay_first', invoice: 'in_first' }] : [] }
      },
    },
    invoices: {
      async retrieve(id: string) {
        return { id, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_fifth' } } }
      },
    },
    charges: {
      async retrieve(id: string) {
        return { id, customer: 'cus_fifth' }
      },
    },
  } as unknown as Stripe
}
