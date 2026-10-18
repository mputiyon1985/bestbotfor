import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribers } from './db/schema'
import type { Database } from './db/client'
import {
  PENDING_SUCCESS,
  PENDING_SUBSCRIBER_STATUS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCED_SUCCESS,
  backfillPendingSubscribers,
  countSyncedSubscribers,
  newsletterBackfillAllowed,
  subscribeToNewsletter,
} from './newsletter'
import { absoluteUrl } from './site'
import { createTestDatabase } from '@/test/db'

const originalKey = process.env.BEEHIIV_API_KEY
const originalPublication = process.env.BEEHIIV_PUBLICATION_ID

afterEach(() => {
  vi.restoreAllMocks()
  if (originalKey === undefined) delete process.env.BEEHIIV_API_KEY
  else process.env.BEEHIIV_API_KEY = originalKey
  if (originalPublication === undefined) delete process.env.BEEHIIV_PUBLICATION_ID
  else process.env.BEEHIIV_PUBLICATION_ID = originalPublication
})

describe('subscribeToNewsletter', () => {
  it('rejects an invalid email and stores nothing', async () => {
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'not-an-email',
      honeypot: '',
      db,
      rateKey: 'newsletter-invalid',
      now: 1_000,
    })
    expect(result.status).toBe('error')
    expect(await db.select().from(subscribers)).toEqual([])
    await close()
  })

  it('answers a honeypot the same way as a real signup and writes nothing', async () => {
    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'person@example.com',
      honeypot: 'https://spam.example',
      db,
      rateKey: 'newsletter-honey',
      now: 1_000,
    })
    expect(result).toEqual({ status: 'success', message: PENDING_SUCCESS, tracked: false })
    expect(await db.select().from(subscribers)).toEqual([])
    await close()
  })

  it('stores a local subscriber when Beehiiv is not configured', async () => {
    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'Person@Example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-local',
      now: 1_000,
    })
    expect(result).toEqual({ status: 'success', message: PENDING_SUCCESS, tracked: true })
    expect(result.message).not.toBe(SYNCED_SUCCESS)
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'person@example.com',
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('sends the address to Beehiiv and stores the remote id', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const calls: string[] = []
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-remote',
      now: 1_000,
      fetchImpl: async (input) => {
        calls.push(String(input))
        return new Response(JSON.stringify({ data: { id: 'sub_remote' } }), { status: 201 })
      },
    })
    expect(result).toMatchObject({ status: 'success', tracked: true })
    expect(calls[0]).toContain('https://api.beehiiv.com/v2/publications/pub_abc123/subscriptions')
    const rows = await db.select().from(subscribers).where(eq(subscribers.email, 'reader@example.com'))
    expect(rows[0]?.destination).toBe('beehiiv')
    expect(rows[0]?.beehiivId).toBe('sub_remote')
    expect(rows[0]?.status).toBe(SYNCED_SUBSCRIBER_STATUS)
    expect(await countSyncedSubscribers(db)).toBe(1)
    await close()
  })

  it('sends the page that offered the form as the Beehiiv referring site', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const bodies: string[] = []
    await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      source: 'best',
      db,
      rateKey: 'newsletter-source',
      now: 1_000,
      fetchImpl: async (_input, init) => {
        bodies.push(String(init?.body ?? ''))
        return new Response(JSON.stringify({ data: { id: 'sub_best' } }), { status: 201 })
      },
    })
    expect(JSON.parse(bodies[0] ?? '{}')).toMatchObject({
      email: 'reader@example.com',
      referring_site: absoluteUrl('/best'),
      double_opt_override: 'on',
    })
    expect(JSON.parse(bodies[0] ?? '{}').double_opt_override).not.toBe('off')
    await close()
  })

  it('does not log the email when Beehiiv rejects the signup', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-log',
      now: 1_000,
      fetchImpl: async () => {
        throw new Error('reader@example.com failed')
      },
    })
    expect(result).toMatchObject({ status: 'error', tracked: false })
    expect(await db.select().from(subscribers)).toEqual([])
    const logged = error.mock.calls.flat().map((part) => String(part)).join('\n')
    expect(logged).not.toContain('reader@example.com')
    await close()
  })

  it('does not store a signup when the limiter errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const db = { $client: { execute: () => Promise.reject(new Error('store down')) } } as unknown as Database
    const result = await subscribeToNewsletter({
      email: 'person@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-down',
      now: 1_000,
    })
    expect(result).toMatchObject({ status: 'error', tracked: false })
    expect(result.message).toBe('Signup is temporarily unavailable. Try again.')
  })

  it('stops after the hourly signup limit', async () => {
    const { db, close } = await createTestDatabase()
    for (let index = 0; index < 5; index += 1) {
      const ok = await subscribeToNewsletter({
        email: `reader${index}@example.com`,
        honeypot: '',
        db,
        rateKey: 'newsletter-limit',
        now: 5_000,
      })
      expect(ok.status).toBe('success')
    }
    const blocked = await subscribeToNewsletter({
      email: 'reader6@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-limit',
      now: 5_000,
    })
    expect(blocked.status).toBe('error')
    expect(blocked.message).toContain('Too many')
    await close()
  })

  it('stays pending when only one Beehiiv value is set', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    delete process.env.BEEHIIV_PUBLICATION_ID
    const { db, close } = await createTestDatabase()
    let called = false
    const result = await subscribeToNewsletter({
      email: 'person@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-half',
      now: 1_000,
      fetchImpl: async () => {
        called = true
        return new Response('{}', { status: 201 })
      },
    })
    expect(called).toBe(false)
    expect(result.message).toBe(PENDING_SUCCESS)
    expect((await db.select().from(subscribers))[0]?.status).toBe(PENDING_SUBSCRIBER_STATUS)
    await close()
  })

  it('returns early only after Beehiiv has the address', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'beehiiv',
      beehiivId: 'sub_existing',
      status: SYNCED_SUBSCRIBER_STATUS,
    })
    let called = false
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-synced',
      now: 2_000,
      fetchImpl: async () => {
        called = true
        return new Response('{}', { status: 201 })
      },
    })
    expect(called).toBe(false)
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    await close()
  })

  it('sends a pending row to Beehiiv with double opt-in once both keys exist', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const bodies: string[] = []
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-promote',
      now: 2_000,
      fetchImpl: async (_input, init) => {
        bodies.push(String(init?.body ?? ''))
        return new Response(JSON.stringify({ data: { id: 'sub_later' } }), { status: 201 })
      },
    })
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    expect(JSON.parse(bodies[0] ?? '{}').double_opt_override).toBe('on')
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ destination: 'beehiiv', beehiivId: 'sub_later', status: SYNCED_SUBSCRIBER_STATUS })
    expect(await countSyncedSubscribers(db)).toBe(1)
    await close()
  })

  it('leaves a pending row pending when Beehiiv rejects the later attempt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-promote-fail',
      now: 2_000,
      fetchImpl: async () => new Response('no', { status: 500 }),
    })
    expect(result.status).toBe('error')
    expect((await db.select().from(subscribers))[0]?.status).toBe(PENDING_SUBSCRIBER_STATUS)
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('dry-runs the pending backfill and then sends each address once', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    await db.insert(subscribers).values({
      email: 'synced@example.com',
      createdAt: 1,
      destination: 'beehiiv',
      beehiivId: 'sub_done',
      status: SYNCED_SUBSCRIBER_STATUS,
    })
    let calls = 0
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls += 1
      expect(JSON.parse(String(init?.body ?? '{}')).double_opt_override).toBe('on')
      return new Response(JSON.stringify({ data: { id: 'sub_backfill' } }), { status: 201 })
    }
    const preview = await backfillPendingSubscribers({ db, apply: false, fetchImpl })
    expect(preview).toMatchObject({ dryRun: true, pending: 1, synced: 0, failed: 0 })
    expect(calls).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'reader@example.com')))[0]?.status).toBe(
      PENDING_SUBSCRIBER_STATUS,
    )

    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const blocked = await backfillPendingSubscribers({ db, apply: true, fetchImpl })
    expect(blocked).toMatchObject({ dryRun: false, unconfigured: true, synced: 0, failed: 1 })
    expect(calls).toBe(0)

    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const applied = await backfillPendingSubscribers({ db, apply: true, fetchImpl })
    expect(applied).toMatchObject({ dryRun: false, pending: 1, synced: 1, failed: 0, unconfigured: false })
    expect(calls).toBe(1)
    const again = await backfillPendingSubscribers({ db, apply: true, fetchImpl })
    expect(again).toMatchObject({ pending: 0, synced: 0, failed: 0 })
    expect(calls).toBe(1)
    expect(await countSyncedSubscribers(db)).toBe(2)
    await close()
  })

  it('refuses a production newsletter backfill', () => {
    expect(newsletterBackfillAllowed({ vercelEnv: 'production', databaseUrl: 'file:./data/local.db' })).toEqual({
      ok: false,
      reason: 'Newsletter backfill does not run in production.',
    })
    expect(
      newsletterBackfillAllowed({
        vercelEnv: 'preview',
        databaseUrl: 'libsql://agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io',
      }),
    ).toEqual({ ok: false, reason: 'Newsletter backfill does not run against the production database.' })
    expect(newsletterBackfillAllowed({ vercelEnv: 'test', databaseUrl: 'file:./data/local.db' })).toEqual({ ok: true })
  })
})
