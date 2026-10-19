import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Guards from Sentinel's QA of #98 (qa-pr98-action.test.ts): the short
// founding hold and the per-address founding-hold limit close the free
// lock-all-5 path that has been live since #81.

const calls: string[] = []
const creates: Array<{ key: string; expires_at?: number; email?: string }> = []
let dbImpl: unknown = null
let ip = '203.0.113.9'
let cardMode: 'ok' | 'fail' = 'ok'
let stripeMode: 'ok' | 'throw' = 'ok'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: '127.0.0.1:3000', 'x-forwarded-for': ip }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    calls.push('redirect')
    throw new Error(`REDIRECT ${url}`)
  },
}))
vi.mock('@/lib/db', async (original) => ({ ...(await original<Record<string, unknown>>()), getDb: () => dbImpl }))
vi.mock('@/lib/stripe', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: { expires_at?: number; customer_email?: string }, options: { idempotencyKey: string }) => {
          calls.push('stripe.create')
          if (stripeMode === 'throw') throw Object.assign(new Error('boom'), { name: 'StripeConnectionError' })
          creates.push({ key: options.idempotencyKey, expires_at: params.expires_at, email: params.customer_email })
          return { url: `https://checkout.stripe.com/c/pay/cs_test_${creates.length}` }
        },
      },
    },
  }),
}))
vi.mock('@/lib/sponsor-card', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  readSponsorCardForm: async () => ({ ok: true, card: {} }),
  savePendingSponsorCard: async () => {
    calls.push('card.save')
    return cardMode === 'ok' ? { ok: true, id: 7 } : { ok: false, message: 'Card could not be saved.' }
  },
}))

import { sponsorCheckoutAction } from '@/app/sponsor/actions'
import { createTestDatabase } from '@/test/db'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { claimSponsorSlot, foundingSpotsTaken, SPONSOR_SLOT_TAKEN, sponsorHoldKey } from './sponsor-availability'
import { FOUNDING_HOLD_LIMIT_MESSAGE, foundingHoldTimedOutMessage, parseSponsorCheckout, sponsorCheckoutParams } from './sponsor-checkout'
import {
  FOUNDING_CHECKOUT_SESSION_MS,
  FOUNDING_HOLD_KEY_SUFFIX,
  FOUNDING_HOLD_MS,
  isLegacyFoundingHoldKey,
  LEGACY_FOUNDING_HOLD_MS,
  SPONSOR_CHECKOUT_EXPIRY_MS,
} from './sponsor-hold-window'
import { FOUNDING_SOLD_OUT } from './sponsor-offerings'

const MIN = 60_000
const KEYS = ['VERCEL_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_PRICE_FOUNDING_MONTHLY', 'STRIPE_PRICE_FOUNDING_SETUP', 'STRIPE_PRICE_PLACEMENT_WEEKLY', 'RATE_LIMIT_HMAC_SECRET']
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))
const TASKS = ['writing', 'images', 'video', 'voice', 'music', 'research', 'coding']
const RID = (n: number) => `3b241101-e2bb-4255-8caf-${String(n).padStart(12, '0')}`
const T0 = Date.UTC(2026, 9, 19, 14)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  process.env.VERCEL_ENV = 'preview'
  process.env.STRIPE_SECRET_KEY = ['sk', 'test', 'founding'].join('_')
  process.env.STRIPE_PRICE_FOUNDING_MONTHLY = 'price_fm'
  process.env.STRIPE_PRICE_FOUNDING_SETUP = 'price_fs'
  process.env.RATE_LIMIT_HMAC_SECRET = 'ci-rate-limit-hmac-secret-value-40-bytes'
  cardMode = 'ok'
  stripeMode = 'ok'
  ip = '203.0.113.9'
})

afterEach(() => {
  vi.useRealTimers()
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  calls.length = 0
  creates.length = 0
})

function form(task: string, requestId: string, email = 'buyer@example.com') {
  const data = new FormData()
  data.set('offering', 'founding_sponsor')
  data.set('email', email)
  data.set('company', 'Acme Tools')
  data.set('request_id', requestId)
  data.set('task_slug', task)
  return data
}

const run = (data: FormData) =>
  sponsorCheckoutAction({ status: 'idle', message: '' }, data).then(
    (result) => result.message,
    (error: Error) => (error.message.startsWith('REDIRECT') ? 'REDIRECT' : error.message),
  )

async function paid(db: Database, count: number) {
  for (let index = 0; index < count; index++) {
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: `cs_test_paid_${index}`,
      offering: 'founding_sponsor',
      status: 'paid',
      taskSlug: TASKS[index] ?? '',
      createdAt: T0 - 1,
      updatedAt: T0 - 1,
      paidAt: T0 - 1,
    })
  }
}

async function hold(db: Database, task: string) {
  const result = await db.$client.execute({
    sql: 'SELECT request_key, offering, claimed_at FROM sponsorship_slot_claims WHERE task_slug = ?',
    args: [task],
  })
  return result.rows[0] ? { requestKey: String(result.rows[0].request_key), claimedAt: Number(result.rows[0].claimed_at) } : null
}

async function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const { db, close } = await createTestDatabase()
  dbImpl = db
  try {
    return await fn(db)
  } finally {
    await close()
  }
}

describe('short founding hold', () => {
  it('expires the founding session 60 minutes after claimed_at and keys it by claimed_at', () =>
    withDb(async (db) => {
      await paid(db, 4)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      const held = await hold(db, 'coding')
      expect(held?.claimedAt).toBe(T0)
      expect(creates).toHaveLength(1)
      expect(creates[0]?.expires_at).toBe((T0 + 60 * MIN) / 1000)
      expect(FOUNDING_CHECKOUT_SESSION_MS).toBe(60 * MIN)
      expect(creates[0]?.key).toMatch(new RegExp(`-${RID(1)}-h${T0}$`))
    }))

  it('a same-form retry while the hold is live replays the same key and expires_at and never moves claimed_at', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      vi.setSystemTime(T0 + 20 * MIN)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      vi.setSystemTime(T0 + 29 * MIN)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      expect(new Set(creates.map((create) => create.key)).size).toBe(1)
      expect(new Set(creates.map((create) => create.expires_at)).size).toBe(1)
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0)
    }))

  it('counts a founding hold toward the cap for 65 minutes, then frees the spot', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      expect(FOUNDING_HOLD_MS).toBe(65 * MIN)
      vi.setSystemTime(T0 + FOUNDING_HOLD_MS - 1)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
      ip = '198.51.100.7'
      expect(await run(form('research', RID(2), 'other@example.com'))).toBe(FOUNDING_SOLD_OUT)
      vi.setSystemTime(T0 + FOUNDING_HOLD_MS)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(4)
      expect(await run(form('research', RID(2), 'other@example.com'))).toBe('REDIRECT')
      // The session of the lapsed hold ended 5 minutes before the hold stopped counting.
      expect((creates[0]?.expires_at ?? 0) * 1000).toBeLessThanOrEqual(T0 + FOUNDING_HOLD_MS - 5 * MIN)
    }))

  it('the same request after its hold lapsed takes a new hold with a new key (no renewal while live)', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      vi.setSystemTime(T0 + FOUNDING_HOLD_MS + MIN)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0 + FOUNDING_HOLD_MS + MIN)
      expect(creates).toHaveLength(2)
      expect(creates[1]?.key).not.toBe(creates[0]?.key)
      // The first session had already expired when the second was made.
      expect((creates[0]?.expires_at ?? 0) * 1000).toBeLessThan(Date.now())
    }))

  it('a placement hold still counts for 24 hours', () =>
    withDb(async (db) => {
      expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-a', now: T0 })).toMatchObject({ ok: true })
      expect(
        await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-b', now: T0 + FOUNDING_HOLD_MS + 1 }),
      ).toMatchObject({ ok: false })
      expect(
        await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-b', now: T0 + SPONSOR_CHECKOUT_EXPIRY_MS }),
      ).toMatchObject({ ok: true })
    }))

  it('a founding hold past 29 minutes whose new session Stripe cannot start gets the timed-out message, and keeps the hold', () =>
    withDb(async (db) => {
      await paid(db, 4)
      stripeMode = 'throw'
      expect(await run(form('coding', RID(1)))).toBe('Checkout could not be started. Try again.')
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0)
      vi.setSystemTime(T0 + 40 * MIN)
      expect(await run(form('coding', RID(1)))).toBe(foundingHoldTimedOutMessage(25))
      expect(foundingHoldTimedOutMessage(25)).toBe(
        'This founding checkout timed out. The spot stays held for 25 minutes; reload the page after that to start again.',
      )
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
    }))

  it('within a minute of expires_at it refuses without calling Stripe', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      calls.length = 0
      vi.setSystemTime(T0 + 59 * MIN + 30_000)
      expect(await run(form('coding', RID(1)))).toBe(foundingHoldTimedOutMessage(6))
      expect(calls).not.toContain('stripe.create')
    }))
})

describe('founding hold release', () => {
  it('a failed Stripe create keeps the founding hold, since a session may exist', () =>
    withDb(async (db) => {
      await paid(db, 4)
      stripeMode = 'throw'
      await run(form('coding', RID(1)))
      expect(calls).toContain('stripe.create')
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
    }))

  it('a card-save failure releases a hold this attempt created, before Stripe is called', () =>
    withDb(async (db) => {
      await paid(db, 4)
      cardMode = 'fail'
      expect(await run(form('coding', RID(1)))).toBe('Card could not be saved.')
      expect(calls).toEqual(['card.save'])
      expect((await hold(db, 'coding'))?.claimedAt).toBe(0)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(4)
    }))

  it('a card-save failure on a reused hold keeps it, since an earlier attempt may have a session', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      cardMode = 'fail'
      vi.setSystemTime(T0 + 5 * MIN)
      expect(await run(form('coding', RID(1)))).toBe('Card could not be saved.')
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
    }))
})

describe('per-address founding hold limit', () => {
  it("Sentinel's lock-all-5 repro: one address gets 2 founding holds, then is refused, and another buyer still gets a spot", () =>
    withDb(async (db) => {
      const out: string[] = []
      for (let index = 0; index < 5; index++) out.push(await run(form(TASKS[index] ?? '', RID(10 + index), `x${index}@example.com`)))
      expect(out).toEqual(['REDIRECT', 'REDIRECT', FOUNDING_HOLD_LIMIT_MESSAGE, FOUNDING_HOLD_LIMIT_MESSAGE, FOUNDING_HOLD_LIMIT_MESSAGE])
      expect(FOUNDING_HOLD_LIMIT_MESSAGE).toBe(
        'Too many founding sponsor checkouts from this network today. Try again tomorrow, or email mark@bestbotfor.com.',
      )
      // Refused holds were released at once, before Stripe.
      expect(await foundingSpotsTaken(db, Date.now())).toBe(2)
      expect(creates).toHaveLength(2)
      ip = '198.51.100.7'
      expect(await run(form('coding', RID(99), 'real@example.com'))).toBe('REDIRECT')
      expect(await foundingSpotsTaken(db, Date.now())).toBe(3)
    }))

  it('a retry of a live hold does not count against the limit', () =>
    withDb(async () => {
      for (let attempt = 0; attempt < 4; attempt++) expect(await run(form('writing', RID(1)))).toBe('REDIRECT')
      expect(await run(form('images', RID(2), 'second@example.com'))).toBe('REDIRECT')
      expect(await run(form('video', RID(3), 'third@example.com'))).toBe(FOUNDING_HOLD_LIMIT_MESSAGE)
    }))

  it('the limit resets after 24 hours and is separate from placement checkouts', () =>
    withDb(async (db) => {
      await run(form('writing', RID(1)))
      await run(form('images', RID(2)))
      expect(await run(form('video', RID(3)))).toBe(FOUNDING_HOLD_LIMIT_MESSAGE)
      vi.setSystemTime(T0 + 24 * 60 * MIN)
      expect(await run(form('video', RID(3)))).toBe('REDIRECT')
      expect(await foundingSpotsTaken(db, Date.now())).toBe(1)
    }))

  it('fails closed when the limiter is unavailable, and releases the new hold', () =>
    withDb(async (db) => {
      await run(form('writing', RID(1)))
      // Let the sponsor limiter (the first rate_limits write) through, then fail the founding-hold limiter (the second).
      const original = db.$client.execute.bind(db.$client)
      let limiterWrites = 0
      const spy = vi.spyOn(db.$client, 'execute').mockImplementation(((statement: Parameters<typeof original>[0]) => {
        const sql = typeof statement === 'string' ? statement : (statement as { sql: string }).sql
        if (sql.includes('INSERT INTO rate_limits') && ++limiterWrites === 2) {
          return Promise.reject(Object.assign(new Error('down'), { name: 'LibsqlError' }))
        }
        return original(statement)
      }) as typeof db.$client.execute)
      expect(await run(form('images', RID(2), 'second@example.com'))).toBe('Checkout is temporarily unavailable. Try again.')
      spy.mockRestore()
      expect((await hold(db, 'images'))?.claimedAt).toBe(0)
    }))
})

// Reviewer must-fix on #103: founding holds written by main before this deploy.
// Their request_key is the bare request_id; their Checkout has Stripe's
// default 24-hour expiry and the key `sponsor-<fingerprint>-<request_id>`.
describe('legacy founding holds (written before #103)', () => {
  const HOUR = 60 * MIN
  const LEGACY_KEY = (requestId: string) => new RegExp(`^sponsor-[0-9a-f]{16}-${requestId}$`)

  async function legacyHold(db: Database, task: string, requestId: string, claimedAt: number) {
    await db.$client.execute({
      sql: 'INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES (?, ?, ?, ?)',
      args: [task, requestId, 'founding_sponsor', claimedAt],
    })
  }

  it('new founding holds are marked, so a bare request_id is recognisably legacy', () =>
    withDb(async (db) => {
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      expect((await hold(db, 'coding'))?.requestKey).toBe(`${RID(1)}${FOUNDING_HOLD_KEY_SUFFIX}`)
      expect(isLegacyFoundingHoldKey(`${RID(1)}${FOUNDING_HOLD_KEY_SUFFIX}`)).toBe(false)
      expect(isLegacyFoundingHoldKey(RID(1))).toBe(true)
      expect(sponsorHoldKey({ requestKey: RID(1), offering: 'placement_weekly' })).toBe(RID(1))
    }))

  it('a legacy hold still counts toward the cap at 66 minutes and at 23 hours', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await legacyHold(db, 'coding', RID(1), T0)
      for (const at of [T0 + 66 * MIN, T0 + 23 * HOUR]) {
        vi.setSystemTime(at)
        expect(await foundingSpotsTaken(db, at)).toBe(5)
        expect(await run(form('chat', RID(2), 'other@example.com'))).toBe(FOUNDING_SOLD_OUT)
        // Another request cannot take over the legacy hold's page either.
        expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: RID(3), now: at })).toEqual({
          ok: false,
          message: SPONSOR_SLOT_TAKEN,
        })
      }
      expect(creates).toHaveLength(0)
      expect(await hold(db, 'coding')).toEqual({ requestKey: RID(1), claimedAt: T0 })
    }))

  it('a retry of a legacy hold reuses the legacy idempotency key with no expires_at, and never writes a new hold', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await legacyHold(db, 'coding', RID(1), T0)
      for (const at of [T0 + 5 * MIN, T0 + 66 * MIN, T0 + 23 * HOUR]) {
        vi.setSystemTime(at)
        expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      }
      expect(creates).toHaveLength(3)
      for (const create of creates) {
        expect(create.key).toMatch(LEGACY_KEY(RID(1)))
        expect(create.key).not.toContain('-h')
        expect(create.expires_at).toBeUndefined()
      }
      expect(new Set(creates.map((create) => create.key)).size).toBe(1)
      // The legacy row is untouched: bare request_id, original claimed_at, still counting.
      expect(await hold(db, 'coding')).toEqual({ requestKey: RID(1), claimedAt: T0 })
      expect(await foundingSpotsTaken(db, T0 + 23 * HOUR)).toBe(5)
      // A retry is not a new hold, so it never uses the per-address founding hold limit.
      expect(await run(form('writing', RID(4), 'a@example.com'))).not.toBe(FOUNDING_HOLD_LIMIT_MESSAGE)
    }))

  it('the legacy params are the pre-#103 body: the short-hold body minus expires_at, under the key minus -h', () => {
    process.env.STRIPE_PRICE_FOUNDING_MONTHLY = 'price_fm'
    process.env.STRIPE_PRICE_FOUNDING_SETUP = 'price_fs'
    const parsed = parseSponsorCheckout(form('coding', RID(1)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const urls = { successUrl: 'https://bestbotfor.com/sponsor/thanks?session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'https://bestbotfor.com/sponsor' }
    const short = sponsorCheckoutParams({ ...parsed.value, creativeId: '7', claimedAt: T0, ...urls })
    const legacy = sponsorCheckoutParams({ ...parsed.value, creativeId: '7', claimedAt: T0, legacyFoundingHold: true, ...urls })
    expect(legacy.idempotencyKey).toBe(short.idempotencyKey.replace(`-h${T0}`, ''))
    expect(legacy.params).not.toHaveProperty('expires_at')
    const { expires_at: _expiresAt, ...shortWithoutExpiry } = short.params
    expect(legacy.params).toEqual(shortWithoutExpiry)
  })

  it('a legacy hold stops counting 24 hours (+5 minutes) after creation; replays stop a minute before Stripe expires the session', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await legacyHold(db, 'coding', RID(1), T0)
      expect(LEGACY_FOUNDING_HOLD_MS).toBe(24 * HOUR + 5 * MIN)
      // Inside the last minute of the 24-hour session: refused without calling Stripe, hold kept.
      vi.setSystemTime(T0 + 24 * HOUR - 30_000)
      expect(await run(form('coding', RID(1)))).toBe(foundingHoldTimedOutMessage(6))
      expect(creates).toHaveLength(0)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS - 1)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
      expect(await run(form('chat', RID(2), 'other@example.com'))).toBe(FOUNDING_SOLD_OUT)
      // After 24h + 5m the spot is free.
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(4)
      // The same request now takes a new short hold: marked key, -h key, 60-minute expiry.
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      expect(await hold(db, 'coding')).toEqual({ requestKey: `${RID(1)}${FOUNDING_HOLD_KEY_SUFFIX}`, claimedAt: T0 + LEGACY_FOUNDING_HOLD_MS })
      expect(creates[0]?.key).toMatch(new RegExp(`-${RID(1)}-h${T0 + LEGACY_FOUNDING_HOLD_MS}$`))
      expect(creates[0]?.expires_at).toBe((T0 + LEGACY_FOUNDING_HOLD_MS + 60 * MIN) / 1000)
    }))

  it('a legacy hold on another page can be taken over by a new buyer after 24h + 5m, not before', () =>
    withDb(async (db) => {
      await legacyHold(db, 'coding', RID(1), T0)
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS - 1)
      expect(await run(form('coding', RID(2), 'other@example.com'))).toBe(SPONSOR_SLOT_TAKEN)
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS)
      expect(await run(form('coding', RID(2), 'other@example.com'))).toBe('REDIRECT')
      expect((await hold(db, 'coding'))?.requestKey).toBe(`${RID(2)}${FOUNDING_HOLD_KEY_SUFFIX}`)
    }))
})
