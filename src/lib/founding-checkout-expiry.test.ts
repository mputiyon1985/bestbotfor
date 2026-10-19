import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { createTestDatabase } from '@/test/db'
import { resetDbCache } from './db'
import { sponsorships } from './db/schema'
import {
  FOUNDING_CHECKOUT_SESSION_MS,
  SPONSOR_CHECKOUT_EXPIRY_MS,
  claimSponsorSlot,
  foundingCheckoutExpiresAt,
  foundingSpotsTaken,
  releaseSponsorSlot,
} from './sponsor-availability'
import { sponsorCheckoutParams, type SponsorCheckoutInput } from './sponsor-checkout'
import { SPONSOR_SOLD_OUT_LABEL } from './sponsor-offerings'
import { resetStripeCache } from './stripe'

// Sentinel's P3s on #97: founding session expiry (P3-3), refunded rows and holds
// (P3-4), and the /sponsor price list on closed or keyless pages and at 5/5 (P3-2, P3-5).

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 9, 19, 14) // Oct 19, 2026 10:00 AM ET
const TASKS = ['writing', 'image', 'video', 'voice', 'music', 'research']
const testKey = ['sk', 'test', 'example'].join('_')
const liveKey = ['sk', 'live', 'example'].join('_')
const urls = { successUrl: 'https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'https://bestbotfor.com/sponsor/cancel' }

const PRICES: Record<string, string> = {
  STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
  STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
  STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
  STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly',
  STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup',
}
const ENV_KEYS = [...Object.keys(PRICES), 'VERCEL_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_ALLOW_LIVE', 'STRIPE_PRICE_PLACEMENT_SUBSCRIPTION', 'TURSO_DATABASE_URL']
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>

function setEnv(env: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    if (key === 'TURSO_DATABASE_URL') continue
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetStripeCache()
}

beforeEach(() => setEnv({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey, ...PRICES }))

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetDbCache()
  resetStripeCache()
})

async function paidFounder(db: TestDb['db'], task: string, index: number, extra: Partial<typeof sponsorships.$inferInsert> = {}) {
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
    ...extra,
  })
}

async function hold(db: TestDb['db'], task: string, claimedAt: number): Promise<void> {
  await db.$client.execute({
    sql: `INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES (?, ?, 'founding_sponsor', ?)`,
    args: [task, `hold-${task}`, claimedAt],
  })
}

async function sponsorHtml(url: string): Promise<string> {
  process.env.TURSO_DATABASE_URL = url
  resetDbCache()
  resetStripeCache()
  return renderToStaticMarkup(await SponsorPage())
}

const listItems = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''))
const foundingLine = (html: string) => listItems(html).filter((li) => li.startsWith('Founding sponsor:'))

function foundingInput(requestId = '123e4567-e89b-42d3-a456-426614174000'): SponsorCheckoutInput {
  return {
    offering: 'founding_sponsor',
    email: 'sponsor@example.com',
    company: 'Example Tools',
    taskSlug: 'coding',
    issueDate: null,
    priceId: 'price_e2e_founding_monthly',
    setupPriceId: 'price_e2e_founding_setup',
    requestId,
  }
}

describe('founding Checkout session expiry (P3-3)', () => {
  it('pins the hold window at 24h and the founding session at 23h55m, 5 minutes inside it', () => {
    expect(SPONSOR_CHECKOUT_EXPIRY_MS).toBe(86_400_000)
    expect(FOUNDING_CHECKOUT_SESSION_MS).toBe(86_100_000)
    expect(SPONSOR_CHECKOUT_EXPIRY_MS - FOUNDING_CHECKOUT_SESSION_MS).toBe(5 * 60 * 1000)
    // Stripe accepts 30 minutes to 24 hours from session creation.
    expect(FOUNDING_CHECKOUT_SESSION_MS).toBeGreaterThan(30 * 60 * 1000)
    expect(FOUNDING_CHECKOUT_SESSION_MS).toBeLessThan(24 * 60 * 60 * 1000)
  })

  it('sets expires_at to claim time + 23h55m, in whole seconds', () => {
    expect(foundingCheckoutExpiresAt(T0)).toBe(1_792_504_500)
    expect(foundingCheckoutExpiresAt(T0 + 999)).toBe(1_792_504_500)
    expect(foundingCheckoutExpiresAt(T0 + 1000)).toBe(1_792_504_501)
    const { params } = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    expect(params.mode).toBe('subscription')
    expect(params.expires_at).toBe(1_792_504_500)
    // 2026-10-20 9:55 AM ET: 23h55m after the 10:00 AM ET claim.
    expect(new Date(params.expires_at! * 1000).toISOString()).toBe('2026-10-20T13:55:00.000Z')
  })

  it('refuses to build a founding session without its hold time', () => {
    for (const claimedAt of [undefined, 0, -1, Number.NaN]) {
      expect(() => sponsorCheckoutParams({ ...foundingInput(), claimedAt, ...urls })).toThrow('founding checkout needs its hold time')
    }
  })

  it('leaves the other offerings on Stripe’s default expiry', () => {
    const base = { email: 'sponsor@example.com', company: 'Example Tools', issueDate: null, requestId: '123e4567-e89b-42d3-a456-426614174000' }
    for (const input of [
      { ...base, offering: 'placement_weekly' as const, taskSlug: 'coding', priceId: 'price_e2e_weekly' },
      { ...base, offering: 'placement_subscription' as const, taskSlug: 'coding', priceId: 'price_e2e_subscription' },
    ]) {
      const { params } = sponsorCheckoutParams({ ...input, claimedAt: T0, ...urls })
      expect(params).not.toHaveProperty('expires_at')
    }
  })

  it('the claim returns its claimed_at; a retry keeps it, so a retried form sends the same expires_at', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const claim = { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-a' }
    expect(await claimSponsorSlot(db, { ...claim, now: T0 })).toEqual({ ok: true, claimedAt: T0 })
    expect(await claimSponsorSlot(db, { ...claim, now: T0 + 60_000 })).toEqual({ ok: true, claimedAt: T0 })
    const first = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    const retried = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    expect(retried).toEqual(first)
    // A released hold (Checkout failed) starts over at the new time.
    await releaseSponsorSlot(db, { taskSlug: 'coding', requestKey: 'req-a' })
    expect(await claimSponsorSlot(db, { ...claim, now: T0 + 120_000 })).toEqual({ ok: true, claimedAt: T0 + 120_000 })
    // So does an expired hold, for this request or another.
    expect(await claimSponsorSlot(db, { ...claim, requestKey: 'req-b', now: T0 + 120_000 + SPONSOR_CHECKOUT_EXPIRY_MS })).toEqual({
      ok: true,
      claimedAt: T0 + 120_000 + SPONSOR_CHECKOUT_EXPIRY_MS,
    })
    await close()
  })

  it('the hold still counts when its session expires, so a session cannot complete after its spot is freed', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    for (const [index, task] of TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    const claimed = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-5', now: T0 })
    expect(claimed).toEqual({ ok: true, claimedAt: T0 })
    const sessionEnd = foundingCheckoutExpiresAt(T0) * 1000
    // At the session's expires_at and up to the hold's 24h, the fifth spot stays held and a sixth buyer is refused.
    for (const at of [sessionEnd, sessionEnd + 4 * 60 * 1000, T0 + SPONSOR_CHECKOUT_EXPIRY_MS - 1]) {
      expect(await foundingSpotsTaken(db, at)).toBe(5)
      expect((await claimSponsorSlot(db, { taskSlug: 'music', offering: 'founding_sponsor', requestKey: 'req-6', now: at })).ok).toBe(false)
    }
    // Only after the hold window does the spot open again.
    expect(await foundingSpotsTaken(db, T0 + SPONSOR_CHECKOUT_EXPIRY_MS + 1)).toBe(4)
    await close()
  })
})

describe('refunded paid rows and holds (P3-4, Sentinel QA97 hold boundaries)', () => {
  it('a hold counts until 24h; a paid row from the hold counts once; an older paid row does not hide it; a refunded paid row does not hide it', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const E = SPONSOR_CHECKOUT_EXPIRY_MS
    await hold(db, 'coding', T0 - E + 1)
    expect(await foundingSpotsTaken(db, T0)).toBe(1) // 1 ms under 24h counts
    expect(await foundingSpotsTaken(db, T0 + 1)).toBe(0) // exactly 24h: expired
    await hold(db, 'writing', T0 - E - 1000)
    expect(await foundingSpotsTaken(db, T0)).toBe(1) // an expired hold is not counted
    // The hold, then its own paid row (paid_at >= claimed_at): counted once.
    await paidFounder(db, 'coding', 9, { paidAt: T0 - E + 1 })
    expect(await foundingSpotsTaken(db, T0)).toBe(1)
    // A paid row older than the hold (paid_at < claimed_at): paid plus hold, a safe overcount.
    await db.$client.execute(`UPDATE sponsorships SET paid_at = ${T0 - E} WHERE stripe_checkout_session_id = 'cs_founder_9'`)
    expect(await foundingSpotsTaken(db, T0)).toBe(2)
    // A refunded paid row does not hide the live hold: the hold still counts once.
    await db.$client.execute(`UPDATE sponsorships SET paid_at = ${T0}, refunded_at = ${T0} WHERE stripe_checkout_session_id = 'cs_founder_9'`)
    expect(await foundingSpotsTaken(db, T0)).toBe(1)
    await close()
  })
})

describe('/sponsor price list at 5/5 (P3-2, P3-5)', () => {
  async function soldOutDb(): Promise<TestDb> {
    const test = await createTestDatabase()
    for (const [index, task] of TASKS.slice(0, 5).entries()) await paidFounder(test.db, task, index)
    return test
  }

  it('a closed or keyless page lists no founding price and no "Limited to 5"', async () => {
    const { url, close } = await soldOutDb()
    for (const env of [
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey, ...PRICES }, // closed: production without the live flag
      { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: liveKey, ...PRICES }, // closed with a live key
      { VERCEL_ENV: 'preview', ...PRICES }, // no key
      { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: '', ...PRICES }, // blank key
    ]) {
      setEnv(env)
      const html = await sponsorHtml(url)
      expect(foundingLine(html)).toEqual([])
      expect(html).not.toContain('$99 for 2 weeks')
      expect(html).not.toContain('Limited to 5')
      expect(html).not.toContain(SPONSOR_SOLD_OUT_LABEL)
      expect(html).toContain('Featured placement: $299 for one month.')
    }
    await close()
  })

  it('an open page at 5/5 with no placement subscription says only "The prices above are …"', async () => {
    const { url, close } = await soldOutDb()
    const html = await sponsorHtml(url)
    expect(foundingLine(html)).toEqual(['Founding sponsor: Sold out. All 5 founding sponsor spots are taken.'])
    expect(html).toContain('The prices above are the current list prices from server configuration.')
    expect(html).not.toContain('one-time and subscription')
    await close()
  })

  it('still says "one-time and subscription" at 5/5 when the placement subscription is listed, and at 4/5 for founding', async () => {
    const sold = await soldOutDb()
    setEnv({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey, ...PRICES, STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_e2e_subscription' })
    expect(await sponsorHtml(sold.url)).toContain('The prices above, one-time and subscription, are the current list prices')
    await sold.close()

    const open = await createTestDatabase()
    for (const [index, task] of TASKS.slice(0, 4).entries()) await paidFounder(open.db, task, index)
    setEnv({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey, ...PRICES })
    const html = await sponsorHtml(open.url)
    expect(foundingLine(html)[0]).toContain('Limited to 5 founding sponsors.')
    expect(html).toContain('The prices above, one-time and subscription, are the current list prices')
    await open.close()
  })
})
