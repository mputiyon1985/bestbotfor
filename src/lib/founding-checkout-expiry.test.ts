import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { createTestDatabase } from '@/test/db'
import { resetDbCache } from './db'
import { sponsorships } from './db/schema'
import { SPONSOR_SLOT_TAKEN, claimSponsorSlot, foundingSpotsTaken, releaseSponsorSlot } from './sponsor-availability'
import { foundingHoldFormKey, sponsorCheckoutParams, type SponsorCheckoutInput } from './sponsor-checkout'
import {
  FOUNDING_CHECKOUT_SESSION_MS,
  FOUNDING_HOLD_MS,
  SPONSOR_CHECKOUT_EXPIRY_MS,
  STRIPE_CHECKOUT_MIN_EXPIRY_MS,
  foundingCheckoutExpiresAt,
  foundingFormChangedMessage,
} from './sponsor-hold-window'
import { SPONSOR_SOLD_OUT_LABEL } from './sponsor-offerings'
import { resetStripeCache } from './stripe'

// Sentinel's P3s on #97 and must-fixes on #98: founding session expiry (60
// minutes from the claim, hold 65), one open checkout per founding hold (no
// renewal, identical form only), refunded rows and holds (P3-4), and the
// /sponsor price list on closed or keyless pages and at 5/5 (P3-2, P3-5).

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

/** A short founding hold as this code writes it (`<request_id>|<form key>`; a bare key is a legacy 24-hour hold). */
async function hold(db: TestDb['db'], task: string, claimedAt: number): Promise<void> {
  await db.$client.execute({
    sql: `INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES (?, ?, 'founding_sponsor', ?)`,
    args: [task, `hold-${task}|form`, claimedAt],
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

const formKey = (input = foundingInput()) => foundingHoldFormKey({ ...input, ...urls })

describe('founding Checkout session expiry', () => {
  it('pins the founding session at 60 minutes and the hold at 65; placement holds stay 24 hours', () => {
    expect(FOUNDING_CHECKOUT_SESSION_MS).toBe(60 * 60 * 1000)
    expect(FOUNDING_HOLD_MS).toBe(65 * 60 * 1000)
    expect(FOUNDING_HOLD_MS - FOUNDING_CHECKOUT_SESSION_MS).toBe(5 * 60 * 1000)
    expect(SPONSOR_CHECKOUT_EXPIRY_MS).toBe(24 * 60 * 60 * 1000)
    // Stripe accepts 30 minutes to 24 hours from session creation.
    expect(FOUNDING_CHECKOUT_SESSION_MS).toBeGreaterThan(STRIPE_CHECKOUT_MIN_EXPIRY_MS)
  })

  it('sets expires_at to claim time + 60 minutes, in whole seconds', () => {
    expect(foundingCheckoutExpiresAt(T0)).toBe(1_792_422_000)
    expect(foundingCheckoutExpiresAt(T0 + 999)).toBe(1_792_422_000)
    expect(foundingCheckoutExpiresAt(T0 + 1000)).toBe(1_792_422_001)
    const { params } = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    expect(params.mode).toBe('subscription')
    // 2026-10-19 11:00 AM ET: 60 minutes after the 10:00 AM ET claim.
    expect(new Date(params.expires_at! * 1000).toISOString()).toBe('2026-10-19T15:00:00.000Z')
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

  it('the hold still counts when its session expires, so a session cannot complete after its spot is freed', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    for (const [index, task] of TASKS.slice(0, 4).entries()) await paidFounder(db, task, index)
    const claimed = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-5', formKey: formKey(), now: T0 })
    expect(claimed).toMatchObject({ ok: true, claimedAt: T0, fresh: true })
    const sessionEnd = foundingCheckoutExpiresAt(T0) * 1000
    for (const at of [sessionEnd, sessionEnd + 4 * 60 * 1000, T0 + FOUNDING_HOLD_MS - 1]) {
      expect(await foundingSpotsTaken(db, at)).toBe(5)
      expect((await claimSponsorSlot(db, { taskSlug: 'music', offering: 'founding_sponsor', requestKey: 'req-6', now: at })).ok).toBe(false)
    }
    expect(await foundingSpotsTaken(db, T0 + FOUNDING_HOLD_MS)).toBe(4)
    await close()
  })
})

async function holdRow(db: TestDb['db'], task: string) {
  const result = await db.$client.execute({
    sql: 'SELECT request_key, offering, claimed_at FROM sponsorship_slot_claims WHERE task_slug = ?',
    args: [task],
  })
  const row = result.rows[0]
  return row ? { requestKey: String(row.request_key), offering: String(row.offering), claimedAt: Number(row.claimed_at) } : null
}

const REQ = '123e4567-e89b-42d3-a456-426614174000'

describe('one open checkout per founding hold (Sentinel must-fix on #98)', () => {
  it('stores the form key on the hold; an identical form reuses it with the same claimed_at, key and body', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const claim = { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey() }
    expect(await claimSponsorSlot(db, { ...claim, now: T0 })).toMatchObject({ ok: true, claimedAt: T0, fresh: true, holdKey: `${REQ}|${formKey()}` })
    expect(await holdRow(db, 'coding')).toEqual({ requestKey: `${REQ}|${formKey()}`, offering: 'founding_sponsor', claimedAt: T0 })
    for (const at of [T0, T0 + 60_000, T0 + 29 * 60_000, T0 + FOUNDING_HOLD_MS - 1]) {
      expect(await claimSponsorSlot(db, { ...claim, now: at })).toMatchObject({ ok: true, claimedAt: T0, fresh: false })
    }
    const first = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    const again = sponsorCheckoutParams({ ...foundingInput(), claimedAt: T0, ...urls })
    expect(again).toEqual(first)
    expect(first.idempotencyKey).toMatch(new RegExp(`^sponsor-[0-9a-f]{16}-${REQ}-h${T0}$`))
    await close()
  })

  it('no renewal: a live hold never moves claimed_at, so it never gets a second key; only a lapsed hold starts over', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const claim = { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey() }
    await claimSponsorSlot(db, { ...claim, now: T0 })
    // Late in the hold: still the original claimed_at (no renewal path).
    expect(await claimSponsorSlot(db, { ...claim, now: T0 + FOUNDING_HOLD_MS - 1 })).toMatchObject({ claimedAt: T0, fresh: false })
    // Once the hold lapsed, its session (expires_at = T0 + 60m) has already expired.
    const later = T0 + FOUNDING_HOLD_MS
    expect(await claimSponsorSlot(db, { ...claim, now: later })).toMatchObject({ claimedAt: later, fresh: true })
    expect(foundingCheckoutExpiresAt(T0) * 1000).toBeLessThan(later)
    await close()
  })

  it('an edited email, company or any other Stripe input under the same request_id is refused while the hold is live', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(), now: T0 })
    const edits: Array<Partial<SponsorCheckoutInput>> = [
      { email: 'typo-fixed@example.com' },
      { company: 'Example Tools Inc' },
      { priceId: 'price_other' },
      { setupPriceId: 'price_other_setup' },
    ]
    for (const edit of edits) {
      const edited = { ...foundingInput(), ...edit }
      expect(formKey(edited)).not.toBe(formKey())
      expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(edited), now: T0 + 10 * 60_000 })).toEqual({
        ok: false,
        reason: 'founding_form_changed',
        message: foundingFormChangedMessage(55),
      })
    }
    // Other return URLs change the body too.
    expect(foundingHoldFormKey({ ...foundingInput(), ...urls, cancelUrl: 'https://www.bestbotfor.com/sponsor/cancel' })).not.toBe(formKey())
    // The hold is unchanged.
    expect(await holdRow(db, 'coding')).toEqual({ requestKey: `${REQ}|${formKey()}`, offering: 'founding_sponsor', claimedAt: T0 })
    // After the hold lapses, the edited form can start over.
    const edited = { ...foundingInput(), email: 'typo-fixed@example.com' }
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(edited), now: T0 + FOUNDING_HOLD_MS })).toMatchObject({ ok: true, fresh: true })
    await close()
  })

  it('the same request_id on another page, or for another offering, is refused while its founding hold is live', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(), now: T0 })
    const other = { ...foundingInput(), taskSlug: 'music' }
    expect(await claimSponsorSlot(db, { taskSlug: 'music', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(other), now: T0 + 60_000 })).toMatchObject({
      ok: false,
      reason: 'founding_form_changed',
    })
    for (const offering of ['placement_weekly', 'placement_monthly', 'placement_subscription']) {
      for (const task of ['coding', 'music']) {
        expect(await claimSponsorSlot(db, { taskSlug: task, offering, requestKey: REQ, now: T0 + 60_000 })).toMatchObject({ ok: false, reason: 'founding_form_changed' })
      }
    }
    expect(await holdRow(db, 'music')).toBeNull()
    expect(await holdRow(db, 'coding')).toEqual({ requestKey: `${REQ}|${formKey()}`, offering: 'founding_sponsor', claimedAt: T0 })
    expect(await foundingSpotsTaken(db, T0 + 120_000)).toBe(1)
    await close()
  })

  it('a live founding hold written before form keys (a bare request_id) cannot be shown identical, so it refuses', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    await db.$client.execute({
      sql: `INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES ('coding', ?, 'founding_sponsor', ?)`,
      args: [REQ, T0],
    })
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(), now: T0 + 60_000 })).toMatchObject({
      ok: false,
      reason: 'founding_legacy_hold_open',
    })
    await close()
  })

  it('a reload (new request_id) on the held page is refused; the release of a founding hold matches its stored key', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const first = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(), now: T0 })
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-reload', formKey: formKey(), now: T0 + 60_000 })).toEqual({
      ok: false,
      message: SPONSOR_SLOT_TAKEN,
    })
    // releaseSponsorSlot with the bare request_id does nothing; the action passes holdKey.
    await releaseSponsorSlot(db, { taskSlug: 'coding', requestKey: REQ })
    expect((await holdRow(db, 'coding'))?.claimedAt).toBe(T0)
    if (!first.ok || !('holdKey' in first) || !first.holdKey) throw new Error('expected a hold key')
    await releaseSponsorSlot(db, { taskSlug: 'coding', requestKey: first.holdKey })
    expect((await holdRow(db, 'coding'))?.claimedAt).toBe(0)
    await close()
  })

  it('the founding claimed_at freeze is founding only: a placement retry refreshes claimed_at and can switch to founding on its page', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    for (const offering of ['placement_weekly', 'placement_monthly', 'placement_subscription']) {
      await db.$client.execute('DELETE FROM sponsorship_slot_claims')
      const claim = { taskSlug: 'coding', offering, requestKey: REQ }
      expect(await claimSponsorSlot(db, { ...claim, now: T0 })).toMatchObject({ ok: true, claimedAt: T0 })
      expect(await claimSponsorSlot(db, { ...claim, now: T0 + 60_000 })).toMatchObject({ ok: true, claimedAt: T0 + 60_000 })
      // The same form switches to founding on the page it already holds.
      expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: REQ, formKey: formKey(), now: T0 + 120_000 })).toMatchObject({
        ok: true,
        claimedAt: T0 + 120_000,
      })
      expect(await holdRow(db, 'coding')).toEqual({ requestKey: `${REQ}|${formKey()}`, offering: 'founding_sponsor', claimedAt: T0 + 120_000 })
    }
    await close()
  })
})

describe('refunded paid rows and holds (P3-4, Sentinel QA97 hold boundaries)', () => {
  it('a hold counts until 65 minutes; a paid row from the hold counts once; an older paid row does not hide it; a refunded paid row does not hide it', async () => {
    const { db, close }: TestDb = await createTestDatabase()
    const E = FOUNDING_HOLD_MS
    await hold(db, 'coding', T0 - E + 1)
    expect(await foundingSpotsTaken(db, T0)).toBe(1) // 1 ms under 65 minutes counts
    expect(await foundingSpotsTaken(db, T0 + 1)).toBe(0) // exactly 65 minutes: expired
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
