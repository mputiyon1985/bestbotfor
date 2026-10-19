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
import { FOUNDING_HOLD_LIMIT_MESSAGE, foundingFormChangedMessage, foundingHoldTimedOutMessage } from './sponsor-checkout'
import {
  FOUNDING_CHECKOUT_SESSION_MS,
  FOUNDING_HOLD_MS,
  foundingLegacyHoldOpenMessage,
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

function form(task: string, requestId: string, email = 'buyer@example.com', company = 'Acme Tools', offering = 'founding_sponsor') {
  const data = new FormData()
  data.set('offering', offering)
  data.set('email', email)
  data.set('company', company)
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

describe('one open checkout per founding hold (Sentinel must-fix on #98, action level)', () => {
  it("Sentinel's edited-form repro: a changed email or company under the same request_id is refused and never reaches Stripe", () =>
    withDb(async (db) => {
      await paid(db, 4)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      vi.setSystemTime(T0 + 5 * MIN)
      expect(await run(form('coding', RID(1), 'typo-fixed@example.com'))).toBe(foundingFormChangedMessage(60))
      expect(await run(form('coding', RID(1), 'buyer@example.com', 'Acme Tools Inc'))).toBe(foundingFormChangedMessage(60))
      expect(foundingFormChangedMessage(60)).toBe(
        'This form already started a founding checkout with different details, and each founding spot can have only one open checkout. Finish the checkout you opened, or reload the page in 60 minutes to start again with the new details.',
      )
      // Two identical attempts reached Stripe with one key and one body; the edits never did.
      expect(creates).toHaveLength(2)
      expect(new Set(creates.map((create) => create.key)).size).toBe(1)
      expect(new Set(creates.map((create) => create.email))).toEqual(new Set(['buyer@example.com']))
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
    }))

  it('the same request_id switching page or offering is refused while its founding hold is live', () =>
    withDb(async (db) => {
      process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_w'
      await run(form('coding', RID(1)))
      expect(await run(form('research', RID(1)))).toBe(foundingFormChangedMessage(65))
      expect(await run(form('coding', RID(1), 'buyer@example.com', 'Acme Tools', 'placement_weekly'))).toBe(foundingFormChangedMessage(65))
      expect(creates).toHaveLength(1)
      expect((await hold(db, 'research'))).toBeNull()
    }))

  it('no renewal: late in the hold an identical retry replays the same key; there is never a second key while the hold is live', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await run(form('coding', RID(1)))
      // Sentinel's renewal repro used 23h20m; the hold is now 65 minutes and has no renewal path.
      for (const at of [10 * MIN, 25 * MIN, 29 * MIN, 58 * MIN]) {
        vi.setSystemTime(T0 + at)
        expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      }
      expect(new Set(creates.map((create) => create.key)).size).toBe(1)
      expect((await hold(db, 'coding'))?.claimedAt).toBe(T0)
    }))

  it('a Stripe failure on an edited retry cannot happen: the edit is refused before the card save and Stripe', () =>
    withDb(async () => {
      await run(form('coding', RID(1)))
      calls.length = 0
      await run(form('coding', RID(1), 'other@example.com'))
      expect(calls).toEqual([])
    }))
})

// Reviewer must-fix on #98 and #103: founding holds written by main before this
// deploy. Their request_key is the bare request_id; their Checkout has Stripe's
// default 24-hour expiry and the key `sponsor-<fingerprint>-<request_id>`. A
// bare hold has no form key, so #98 refuses every request from that request_id
// for the hold's full window: no new form-key hold, no second session.
describe('legacy founding holds (written before #103)', () => {
  const HOUR = 60 * MIN

  async function legacyHold(db: Database, task: string, requestId: string, claimedAt: number) {
    await db.$client.execute({
      sql: 'INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES (?, ?, ?, ?)',
      args: [task, requestId, 'founding_sponsor', claimedAt],
    })
  }

  it('new founding holds are marked with their form key, so a bare request_id is recognisably legacy', () =>
    withDb(async (db) => {
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      const key = (await hold(db, 'coding'))?.requestKey ?? ''
      expect(key).toMatch(new RegExp(`^${RID(1)}\\|[0-9a-f]{16}$`))
      expect(isLegacyFoundingHoldKey(key)).toBe(false)
      expect(isLegacyFoundingHoldKey(RID(1))).toBe(true)
      expect(sponsorHoldKey({ requestKey: RID(1), offering: 'founding_sponsor' })).toBe(`${RID(1)}|s`)
      expect(sponsorHoldKey({ requestKey: RID(1), offering: 'placement_weekly', formKey: 'x' })).toBe(RID(1))
    }))

  it('a legacy hold still counts toward the cap at 66 minutes and at 23 hours', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await legacyHold(db, 'coding', RID(1), T0)
      for (const at of [T0 + 66 * MIN, T0 + 23 * HOUR]) {
        vi.setSystemTime(at)
        expect(await foundingSpotsTaken(db, at)).toBe(5)
        expect(await run(form('chat', RID(2), 'other@example.com'))).toBe(FOUNDING_SOLD_OUT)
        // A reload (new request_id) on the legacy hold's page is refused too.
        expect(await run(form('coding', RID(3), 'other@example.com'))).toBe(SPONSOR_SLOT_TAKEN)
      }
      expect(creates).toHaveLength(0)
      expect(await hold(db, 'coding')).toEqual({ requestKey: RID(1), claimedAt: T0 })
    }))

  it('the same request_id is refused for the full window, identical or edited, on any page: no new hold, no Stripe call', () =>
    withDb(async (db) => {
      process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_w'
      await legacyHold(db, 'coding', RID(1), T0)
      for (const at of [T0 + 5 * MIN, T0 + 66 * MIN, T0 + 23 * HOUR, T0 + LEGACY_FOUNDING_HOLD_MS - 1]) {
        vi.setSystemTime(at)
        calls.length = 0
        const message = foundingLegacyHoldOpenMessage(Math.max(1, Math.ceil((T0 + LEGACY_FOUNDING_HOLD_MS - at) / MIN)))
        expect(await run(form('coding', RID(1)))).toBe(message)
        expect(await run(form('coding', RID(1), 'typo-fixed@example.com'))).toBe(message)
        expect(await run(form('research', RID(1)))).toBe(message)
        expect(await run(form('coding', RID(1), 'buyer@example.com', 'Acme Tools', 'placement_weekly'))).toBe(message)
        // Refused before the card save and before Stripe.
        expect(calls).toEqual([])
      }
      expect(foundingLegacyHoldOpenMessage(66)).toBe(
        'This form already has an open founding checkout, and each founding spot can have only one. Finish the checkout you opened, or reload the page in 66 minutes to start again.',
      )
      expect(creates).toHaveLength(0)
      expect(await hold(db, 'coding')).toEqual({ requestKey: RID(1), claimedAt: T0 })
      expect(await hold(db, 'research')).toBeNull()
    }))

  it('after 24 hours + 5 minutes the legacy hold expires: the spot is free and the same form takes a new short hold', () =>
    withDb(async (db) => {
      await paid(db, 4)
      await legacyHold(db, 'coding', RID(1), T0)
      expect(LEGACY_FOUNDING_HOLD_MS).toBe(24 * HOUR + 5 * MIN)
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS - 1)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(5)
      vi.setSystemTime(T0 + LEGACY_FOUNDING_HOLD_MS)
      expect(await foundingSpotsTaken(db, Date.now())).toBe(4)
      expect(await run(form('coding', RID(1)))).toBe('REDIRECT')
      const now = T0 + LEGACY_FOUNDING_HOLD_MS
      expect((await hold(db, 'coding'))?.requestKey).toMatch(new RegExp(`^${RID(1)}\\|[0-9a-f]{16}$`))
      expect((await hold(db, 'coding'))?.claimedAt).toBe(now)
      expect(creates).toHaveLength(1)
      expect(creates[0]?.key).toMatch(new RegExp(`-${RID(1)}-h${now}$`))
      expect(creates[0]?.expires_at).toBe((now + 60 * MIN) / 1000)
    }))
})
