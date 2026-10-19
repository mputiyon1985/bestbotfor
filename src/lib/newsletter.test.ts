import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribers } from './db/schema'
import type { Database } from './db/client'
import { reclaimStaleSubscriber } from './newsletter-backfill'
import {
  PENDING_SUCCESS,
  PENDING_SUBSCRIBER_STATUS,
  RACE_SUCCESS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCED_SUCCESS,
  SYNCING_STALE_AFTER_MS,
  ADD_FAILED,
  FAILED_NOTICE,
  FAILED_SUBSCRIBER_STATUS,
  SYNCING_SUBSCRIBER_STATUS,
  UNSUBSCRIBED_SUBSCRIBER_STATUS,
  backfillPendingSubscribers,
  beehiivFoundAction,
  countSyncedSubscribers,
  newsletterBackfillAllowed,
  readStuckAfterMs,
  isSyncingStale,
  reconcileStuckSubscribers,
  subscribeToNewsletter,
} from './newsletter'

const execFileAsync = promisify(execFile)
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
    expect(result).toEqual({ status: 'success', message: PENDING_SUCCESS, tracked: false })
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
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: true })
    expect(result.message).not.toBe("Thanks. You're on the list.")
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
      reactivate_existing: false,
      double_opt_override: 'on',
    })
    expect(JSON.parse(bodies[0] ?? '{}').double_opt_override).not.toBe('off')
    expect(JSON.parse(bodies[0] ?? '{}').reactivate_existing).toBe(false)
    await close()
  })

  it('sends stored first-touch tags to Beehiiv and falls back to the fixed pair without them', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const bodies: Record<string, unknown>[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response(JSON.stringify({ data: { id: `sub_${bodies.length}` } }), { status: 201 })
    }
    await subscribeToNewsletter({
      email: 'tagged@example.com',
      honeypot: '',
      source: 'best',
      firstTouch: { utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'w1_oct19', utm_content: 'fb1', landing_path: '/best/music' },
      db,
      rateKey: 'newsletter-utm-1',
      now: 1_000,
      fetchImpl,
    })
    await subscribeToNewsletter({ email: 'plain@example.com', honeypot: '', db, rateKey: 'newsletter-utm-2', now: 1_000, fetchImpl })
    expect(bodies[0]).toMatchObject({ utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'w1_oct19', utm_content: 'fb1', referring_site: absoluteUrl('/best') })
    expect(bodies[0]).not.toHaveProperty('landing_path')
    expect(bodies[1]).toMatchObject({ utm_source: 'bestbotfor', utm_medium: 'website' })
    expect(bodies[1]).not.toHaveProperty('utm_campaign')
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
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: true })
    expect(result.message).toBe('Check your email to confirm.')
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

  it('allows a production launch only for the exact prod host and the confirm value', async () => {
    const url = 'libsql://agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io'
    const confirm = 'bestbotfor'
    expect(
      newsletterBackfillAllowed({
        vercelEnv: 'production',
        databaseUrl: url,
        productionLaunch: true,
        confirmName: confirm,
      }),
    ).toEqual({ ok: true })
    expect(
      newsletterBackfillAllowed({
        vercelEnv: undefined,
        databaseUrl: 'libsql://token@agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io.',
        productionLaunch: true,
        confirmName: `  ${confirm}  `,
      }),
    ).toEqual({ ok: true })
    const wrongConfirm = newsletterBackfillAllowed({
      vercelEnv: 'production',
      databaseUrl: url,
      productionLaunch: true,
      confirmName: 'agentic-ai-co-mputiyon1985',
    })
    expect(wrongConfirm).toEqual({
      ok: false,
      reason: 'BACKFILL_PROD_CONFIRM does not match the configured confirm value.',
    })
    expect(wrongConfirm.ok ? '' : wrongConfirm.reason).not.toContain(confirm)
    expect(
      newsletterBackfillAllowed({
        vercelEnv: 'production',
        databaseUrl: url,
        productionLaunch: true,
      }).ok,
    ).toBe(false)
    const refused = [
      'libsql://bestbotfor-preview-test-mputiyon1985.aws-us-east-1.turso.io',
      'libsql://other-workspace.aws-us-east-1.turso.io',
      'libsql://agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io.evil.example',
      'libsql://bestbotfor.aws-us-east-1.turso.io',
      'file:/tmp/bestbotfor-x/test.db',
    ]
    for (const databaseUrl of refused) {
      const decision = newsletterBackfillAllowed({
        vercelEnv: 'production',
        databaseUrl,
        productionLaunch: true,
        confirmName: confirm,
      })
      expect(decision.ok).toBe(false)
      if (!decision.ok) expect(decision.reason).not.toContain('configured confirm value')
    }
    const lookalike = newsletterBackfillAllowed({
      vercelEnv: 'production',
      databaseUrl: 'libsql://agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io.evil.example',
      productionLaunch: true,
      confirmName: confirm,
    })
    expect(lookalike).toEqual({
      ok: false,
      reason:
        'Newsletter backfill production launch refuses host agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io.evil.example.',
    })
    expect(
      newsletterBackfillAllowed({
        vercelEnv: undefined,
        databaseUrl: url,
        productionLaunch: false,
        confirmName: confirm,
      }).ok,
    ).toBe(false)

    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    let calls = 0
    const preview = await backfillPendingSubscribers({
      db,
      apply: false,
      fetchImpl: async () => {
        calls += 1
        return new Response('{}', { status: 201 })
      },
    })
    expect(preview).toMatchObject({ dryRun: true, pending: 1, synced: 0, failed: 0 })
    expect(calls).toBe(0)
    await close()
  })

  it('claims a pending row before the call so a racing signup does not send it twice', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    let backfillCalls = 0
    let signupCalls = 0
    const applied = await backfillPendingSubscribers({
      db,
      apply: true,
      fetchImpl: async (_input, init) => {
        backfillCalls += 1
        expect(JSON.parse(String(init?.body ?? '{}')).double_opt_override).toBe('on')
        const during = await db.select().from(subscribers)
        expect(during[0]?.status).toBe(SYNCING_SUBSCRIBER_STATUS)
        const raced = await subscribeToNewsletter({
          email: 'reader@example.com',
          honeypot: '',
          db,
          rateKey: 'newsletter-race',
          now: 3_000,
          fetchImpl: async () => {
            signupCalls += 1
            return new Response(JSON.stringify({ data: { id: 'sub_race' } }), { status: 201 })
          },
        })
        expect(raced).toEqual({ status: 'success', message: RACE_SUCCESS, tracked: false })
        expect(signupCalls).toBe(0)
        return new Response(JSON.stringify({ data: { id: 'sub_backfill' } }), { status: 201 })
      },
    })
    expect(applied).toMatchObject({ dryRun: false, pending: 1, synced: 1, failed: 0 })
    expect(backfillCalls).toBe(1)
    const again = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-race-after',
      now: 4_000,
      fetchImpl: async () => {
        signupCalls += 1
        return new Response('{}', { status: 201 })
      },
    })
    expect(again).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    expect(signupCalls).toBe(0)
    await close()
  })

  it('puts a failed backfill row back to pending and does not resend a syncing row', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: PENDING_SUBSCRIBER_STATUS,
    })
    await db.insert(subscribers).values({
      email: 'busy@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
    })
    let calls = 0
    const failed = await backfillPendingSubscribers({
      db,
      apply: true,
      fetchImpl: async () => {
        calls += 1
        return new Response('no', { status: 500 })
      },
    })
    expect(failed).toMatchObject({ pending: 1, synced: 0, failed: 1 })
    expect(calls).toBe(1)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'reader@example.com')))[0]?.status).toBe(
      PENDING_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'busy@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )
    await close()
  })

  it('executes the backfill script entry in dry-run mode against a local database', async () => {
    const { db, url } = await createTestDatabase()
    const directory = path.dirname(url.slice('file:'.length))
    const email = 'pending-script@example.com'
    try {
      await db.insert(subscribers).values({
        email,
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: PENDING_SUBSCRIBER_STATUS,
      })
      db.$client.close()
      const { stdout, stderr } = await execFileAsync(
        path.join(process.cwd(), 'node_modules/.bin/tsx'),
        ['scripts/backfill-beehiiv-subscribers.ts'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            TURSO_DATABASE_URL: url,
            VERCEL_ENV: 'test',
            BACKFILL_PROD_CONFIRM: '',
            BEEHIIV_API_KEY: '',
            BEEHIIV_PUBLICATION_ID: '',
          },
        },
      )
      const combined = `${stdout}\n${stderr}`
      expect(combined).not.toContain('server-only')
      expect(combined).not.toContain(email)
      const hostLine = 'Newsletter backfill target host local file.'
      expect(stdout.indexOf(hostLine)).toBeGreaterThanOrEqual(0)
      expect(stdout.indexOf(hostLine)).toBeLessThan(stdout.indexOf('{'))
      expect(stdout).not.toContain('BACKFILL_PROD_CONFIRM')
      const jsonLine = stdout
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('{'))
      expect(JSON.parse(jsonLine ?? '')).toMatchObject({
        dryRun: true,
        pending: 1,
        syncing: 0,
        synced: 0,
        failed: 0,
        unconfigured: true,
        productionLaunch: false,
      })
    } finally {
      try {
        db.$client.close()
      } catch {
        // The script test already closed this connection.
      }
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('leaves a crash-stale syncing row out of the subscriber count and does not post it', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 2_000_000
    await db.insert(subscribers).values({
      email: 'stuck@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - SYNCING_STALE_AFTER_MS,
    })
    let calls = 0
    const applied = await backfillPendingSubscribers({
      db,
      apply: true,
      now,
      fetchImpl: async () => {
        calls += 1
        return new Response(JSON.stringify({ data: { id: 'sub_should_not_post' } }), { status: 201 })
      },
    })
    expect(applied).toMatchObject({ pending: 0, synced: 0, failed: 0 })
    expect(calls).toBe(0)
    expect(await countSyncedSubscribers(db)).toBe(0)
    expect((await db.select().from(subscribers))[0]?.status).toBe(SYNCING_SUBSCRIBER_STATUS)
    await close()
  })

  it('reconciles a stale syncing row from Beehiiv without posting, and returns a missing one to pending', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 5_000_000
    await db.insert(subscribers).values({
      email: 'found@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    await db.insert(subscribers).values({
      email: 'missing@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - SYNCING_STALE_AFTER_MS,
    })
    await db.insert(subscribers).values({
      email: 'fresh@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - 1_000,
    })
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(init?.method).toBe('GET')
      expect(String(input)).toContain('/subscriptions/by_email/')
      expect(init?.body).toBeUndefined()
      const url = String(input)
      if (url.includes(encodeURIComponent('found@example.com'))) {
        return new Response(JSON.stringify({ data: { id: 'sub_found', status: 'active' } }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }
    const preview = await reconcileStuckSubscribers({ db, apply: false, now, fetchImpl })
    expect(preview).toMatchObject({ dryRun: true, stale: 2, synced: 0, released: 0, failed: 0 })
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'found@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )

    const applied = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(applied).toMatchObject({ dryRun: false, stale: 2, synced: 1, released: 1, failed: 0, unconfigured: false })
    const found = (await db.select().from(subscribers).where(eq(subscribers.email, 'found@example.com')))[0]
    expect(found).toMatchObject({ status: SYNCED_SUBSCRIBER_STATUS, destination: 'beehiiv', beehiivId: 'sub_found' })
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'missing@example.com')))[0]?.status).toBe(
      PENDING_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'fresh@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )
    expect(await countSyncedSubscribers(db)).toBe(1)

    const again = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(again).toMatchObject({ stale: 0, synced: 0, released: 0 })
    await close()
  })

  it('signs up again over a stale syncing row without a second post when Beehiiv already has it', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - SYNCING_STALE_AFTER_MS,
    })
    let posts = 0
    let lookups = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response(JSON.stringify({ data: { id: 'sub_posted' } }), { status: 201 })
      }
      lookups += 1
      expect(String(input)).toContain(`/subscriptions/by_email/${encodeURIComponent('reader@example.com')}`)
      return new Response(JSON.stringify({ data: { id: 'sub_already', status: 'validating' } }), { status: 200 })
    }
    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-stale-found',
      now,
      fetchImpl,
    })
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    expect(lookups).toBe(1)
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers))[0]).toMatchObject({
      status: SYNCED_SUBSCRIBER_STATUS,
      beehiivId: 'sub_already',
    })
    const repeat = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-stale-found-again',
      now: now + 1,
      fetchImpl,
    })
    expect(repeat).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    expect(lookups).toBe(1)
    expect(posts).toBe(0)
    await close()
  })

  it('sends a stale syncing row once when Beehiiv does not have it', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: 2_000,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === 'GET') return new Response('{}', { status: 404 })
      posts += 1
      expect(JSON.parse(String(init?.body ?? '{}')).double_opt_override).toBe('on')
      return new Response(JSON.stringify({ data: { id: 'sub_once' } }), { status: 201 })
    }
    const fresh = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-fresh-syncing',
      now: 3_000,
      fetchImpl,
    })
    expect(fresh).toEqual({ status: 'success', message: RACE_SUCCESS, tracked: false })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers))[0]?.status).toBe(SYNCING_SUBSCRIBER_STATUS)

    const result = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-stale-missing',
      now,
      fetchImpl,
    })
    expect(result).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: true })
    expect(posts).toBe(1)
    expect((await db.select().from(subscribers))[0]).toMatchObject({ status: SYNCED_SUBSCRIBER_STATUS, beehiivId: 'sub_once' })
    expect(await countSyncedSubscribers(db)).toBe(1)
    await close()
  })

  it('does not let a reconcile 404 clear a signup that already re-claimed and posted', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - SYNCING_STALE_AFTER_MS,
    })
    let posts = 0
    let gets = 0
    let reconcileInside: () => void = () => undefined
    const reconcileEntered = new Promise<void>((resolve) => {
      reconcileInside = resolve
    })
    let finishReconcileGet: () => void = () => undefined
    const reconcileRelease = new Promise<void>((resolve) => {
      finishReconcileGet = resolve
    })
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        expect(JSON.parse(String(init.body ?? '{}')).double_opt_override).toBe('on')
        return new Response(JSON.stringify({ data: { id: 'sub_once' } }), { status: 201 })
      }
      gets += 1
      if (gets === 1) {
        reconcileInside()
        await reconcileRelease
        return new Response('{}', { status: 404 })
      }
      return new Response('{}', { status: 404 })
    }
    const reconcilePromise = reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    await reconcileEntered
    const signup = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-reconcile-race',
      now,
      fetchImpl,
    })
    finishReconcileGet()
    await reconcilePromise
    expect(signup).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: true })
    expect(posts).toBe(1)
    expect(gets).toBe(2)
    expect((await db.select().from(subscribers))[0]).toMatchObject({
      status: SYNCED_SUBSCRIBER_STATUS,
      destination: 'beehiiv',
      beehiivId: 'sub_once',
    })
    await close()
  })

  it('lets only one of two overlapping stale signups post', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    let posts = 0
    let lookups = 0
    let secondLookupStarted: () => void = () => undefined
    const secondEntered = new Promise<void>((resolve) => {
      secondLookupStarted = resolve
    })
    let releaseSecondLookup: () => void = () => undefined
    const secondLookupRelease = new Promise<void>((resolve) => {
      releaseSecondLookup = resolve
    })
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        expect(JSON.parse(String(init.body ?? '{}')).double_opt_override).toBe('on')
        releaseSecondLookup()
        return new Response(JSON.stringify({ data: { id: 'sub_once' } }), { status: 201 })
      }
      lookups += 1
      if (lookups === 1) {
        await secondEntered
        return new Response('{}', { status: 404 })
      }
      secondLookupStarted()
      await secondLookupRelease
      return new Response('{}', { status: 404 })
    }
    const [first, second] = await Promise.all([
      subscribeToNewsletter({
        email: 'reader@example.com',
        honeypot: '',
        db,
        rateKey: 'newsletter-overlap-a',
        now,
        fetchImpl,
      }),
      subscribeToNewsletter({
        email: 'reader@example.com',
        honeypot: '',
        db,
        rateKey: 'newsletter-overlap-b',
        now,
        fetchImpl,
      }),
    ])
    expect(posts).toBe(1)
    expect(lookups).toBe(2)
    const posted = [first, second].filter((result) => result.tracked)
    expect(posted).toEqual([{ status: 'success', message: SYNCED_SUCCESS, tracked: true }])
    expect(first.status).toBe('success')
    expect(second.status).toBe('success')
    expect((await db.select().from(subscribers))[0]).toMatchObject({
      status: SYNCED_SUBSCRIBER_STATUS,
      beehiivId: 'sub_once',
    })
    expect(await countSyncedSubscribers(db)).toBe(1)
    await close()
  })

  it('leaves a syncing row in place when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'reader@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - SYNCING_STALE_AFTER_MS,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response('{}', { status: 201 })
      }
      return new Response('no', { status: 500 })
    }
    const reconciled = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(reconciled).toMatchObject({ stale: 1, synced: 0, released: 0, failed: 1 })
    expect((await db.select().from(subscribers))[0]?.status).toBe(SYNCING_SUBSCRIBER_STATUS)
    const signup = await subscribeToNewsletter({
      email: 'reader@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-lookup-error',
      now,
      fetchImpl,
    })
    expect(signup).toMatchObject({ status: 'error', tracked: false })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers))[0]?.status).toBe(SYNCING_SUBSCRIBER_STATUS)
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('does not post a stale syncing row when Beehiiv is unset', async () => {
    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'stale@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    await db.insert(subscribers).values({
      email: 'fresh@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now,
    })
    let calls = 0
    const stale = await subscribeToNewsletter({
      email: 'stale@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-unset-stale',
      now,
      fetchImpl: async () => {
        calls += 1
        return new Response('{}', { status: 201 })
      },
    })
    const fresh = await subscribeToNewsletter({
      email: 'fresh@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-unset-fresh',
      now: now + 1_000,
      fetchImpl: async () => {
        calls += 1
        return new Response('{}', { status: 201 })
      },
    })
    expect(stale).toEqual({ status: 'success', message: PENDING_SUCCESS, tracked: false })
    expect(fresh).toEqual({ status: 'success', message: PENDING_SUCCESS, tracked: false })
    expect(calls).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'stale@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'fresh@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('reads the stuck-row age from the reconcile flag and keeps the default', () => {
    expect(readStuckAfterMs(['--reconcile-stuck'])).toBe(SYNCING_STALE_AFTER_MS)
    expect(readStuckAfterMs(['--reconcile-stuck', '--stuck-after-ms', '60000'])).toBe(60_000)
    expect(readStuckAfterMs(['--stuck-after-ms=120000'])).toBe(120_000)
    expect(() => readStuckAfterMs(['--stuck-after-ms', '0'])).toThrow(/positive/)
    expect(() => readStuckAfterMs(['--stuck-after-ms', '59999'])).toThrow(/at least 60000/)
    expect(isSyncingStale(1_000, 2_000, 1)).toBe(false)
    expect(isSyncingStale(1_000, 1_000 + 60_000, 1)).toBe(true)
  })

  it('stamps each backfill claim when that row is claimed', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    await db.insert(subscribers).values([
      {
        email: 'one@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: PENDING_SUBSCRIBER_STATUS,
      },
      {
        email: 'two@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: PENDING_SUBSCRIBER_STATUS,
      },
    ])
    let tick = 50_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      tick += 70_000
      return tick
    })
    const clocks: number[] = []
    await backfillPendingSubscribers({
      db,
      apply: true,
      fetchImpl: async (_input, init) => {
        const email = JSON.parse(String(init?.body ?? '{}')).email as string
        const row = (await db.select().from(subscribers).where(eq(subscribers.email, email)))[0]
        clocks.push(row?.syncingStartedAt ?? 0)
        return new Response(JSON.stringify({ data: { id: 'sub_tick' } }), { status: 201 })
      },
    })
    expect(clocks).toHaveLength(2)
    expect(clocks[0]).not.toBe(clocks[1])
    expect(Math.abs((clocks[0] ?? 0) - (clocks[1] ?? 0))).toBeGreaterThanOrEqual(70_000)
    await close()
  })

  it('does not reclaim a row onto a clock that is not newer than the one it saw', async () => {
    const { db, close } = await createTestDatabase()
    const observed = 80_000
    const inserted = await db
      .insert(subscribers)
      .values({
        email: 'clock@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: observed,
      })
      .returning({ id: subscribers.id })
    const id = inserted[0]?.id ?? 0
    expect(await reclaimStaleSubscriber(db, id, observed, observed)).toBe(false)
    expect(await reclaimStaleSubscriber(db, id, observed, observed - 1)).toBe(false)
    expect((await db.select().from(subscribers))[0]?.syncingStartedAt).toBe(observed)
    expect(await reclaimStaleSubscriber(db, id, observed, observed + 1)).toBe(true)
    expect((await db.select().from(subscribers))[0]?.syncingStartedAt).toBe(observed + 1)
    await close()
  })

  it('marks validating synced and leaves inactive or unsubscribed without posting', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    expect(beehiivFoundAction('active')).toBe('sync')
    expect(beehiivFoundAction('Validating')).toBe('sync')
    expect(beehiivFoundAction('pending')).toBe('sync')
    expect(beehiivFoundAction('inactive')).toBe('opt_out')
    expect(beehiivFoundAction('unsubscribed')).toBe('opt_out')
    expect(beehiivFoundAction('invalid')).toBe('terminal')
    expect(beehiivFoundAction('paused')).toBe('terminal')
    expect(beehiivFoundAction('needs_attention')).toBe('terminal')
    expect(beehiivFoundAction('')).toBe('terminal')
    expect(beehiivFoundAction('mystery')).toBe('terminal')
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values([
      {
        email: 'validating@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: null,
      },
      {
        email: 'inactive@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: null,
      },
      {
        email: 'gone@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: null,
      },
      {
        email: 'unknown@example.com',
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: null,
      },
    ])
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response('{}', { status: 201 })
      }
      const url = String(input)
      if (url.includes(encodeURIComponent('validating@example.com'))) {
        return new Response(JSON.stringify({ data: { id: 'sub_validating', status: 'validating' } }), { status: 200 })
      }
      if (url.includes(encodeURIComponent('inactive@example.com'))) {
        return new Response(JSON.stringify({ data: { id: 'sub_inactive', status: 'inactive' } }), { status: 200 })
      }
      if (url.includes(encodeURIComponent('gone@example.com'))) {
        return new Response(JSON.stringify({ data: { id: 'sub_gone', status: 'unsubscribed' } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { id: 'sub_unknown' } }), { status: 200 })
    }
    const applied = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(applied).toMatchObject({ stale: 4, synced: 1, released: 0, optedOut: 2, terminal: 1, failed: 0 })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'validating@example.com')))[0]).toMatchObject({
      status: SYNCED_SUBSCRIBER_STATUS,
      destination: 'beehiiv',
    })
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'inactive@example.com')))[0]?.status).toBe(
      UNSUBSCRIBED_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'gone@example.com')))[0]?.status).toBe(
      UNSUBSCRIBED_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'unknown@example.com')))[0]).toMatchObject({
      status: FAILED_SUBSCRIBER_STATUS,
      beehiivStatus: '',
    })
    expect(await countSyncedSubscribers(db)).toBe(1)
    await close()
  })

  it('treats Beehiiv pending as already in Beehiiv and does not post', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'waiting@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response(JSON.stringify({ data: { id: 'sub_posted' } }), { status: 201 })
      }
      expect(String(input)).toContain(encodeURIComponent('waiting@example.com'))
      return new Response(JSON.stringify({ data: { id: 'sub_waiting', status: 'pending' } }), { status: 200 })
    }
    const applied = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(applied).toMatchObject({ stale: 1, synced: 1, terminal: 0, failed: 0 })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers))[0]).toMatchObject({
      status: SYNCED_SUBSCRIBER_STATUS,
      beehiivId: 'sub_waiting',
    })
    await db
      .update(subscribers)
      .set({ status: SYNCING_SUBSCRIBER_STATUS, destination: 'local', beehiivId: null, syncingStartedAt: null })
      .where(eq(subscribers.email, 'waiting@example.com'))
    const signup = await subscribeToNewsletter({
      email: 'waiting@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-beehiiv-pending',
      now,
      fetchImpl,
    })
    expect(signup).toEqual({ status: 'success', message: SYNCED_SUCCESS, tracked: false })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers))[0]?.status).toBe(SYNCED_SUBSCRIBER_STATUS)
    await close()
  })

  it('parks invalid, paused, and needs_attention once and does not post them', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    const rows = [
      { email: 'bad@example.com', status: 'invalid', id: 'sub_invalid' },
      { email: 'paused@example.com', status: 'paused', id: 'sub_paused' },
      { email: 'attention@example.com', status: 'needs_attention', id: 'sub_attention' },
    ]
    await db.insert(subscribers).values(
      rows.map((row) => ({
        email: row.email,
        createdAt: 1,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: null,
      })),
    )
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response('{}', { status: 201 })
      }
      const url = String(input)
      const match = rows.find((row) => url.includes(encodeURIComponent(row.email)))
      return new Response(JSON.stringify({ data: { id: match?.id, status: match?.status } }), { status: 200 })
    }
    const applied = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(applied).toMatchObject({ stale: 3, synced: 0, terminal: 3, failed: 0, optedOut: 0 })
    expect(posts).toBe(0)
    for (const row of rows) {
      expect((await db.select().from(subscribers).where(eq(subscribers.email, row.email)))[0]).toMatchObject({
        status: FAILED_SUBSCRIBER_STATUS,
        beehiivStatus: row.status,
        beehiivId: row.id,
      })
    }
    expect(await countSyncedSubscribers(db)).toBe(0)
    const again = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(again).toMatchObject({ stale: 0, terminal: 0, failed: 0 })
    expect(posts).toBe(0)
    const signup = await subscribeToNewsletter({
      email: 'bad@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-terminal',
      now,
      fetchImpl,
    })
    expect(signup).toEqual({ status: 'error', message: FAILED_NOTICE, tracked: false })
    const paused = await subscribeToNewsletter({
      email: 'paused@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-paused',
      now,
      fetchImpl,
    })
    const attention = await subscribeToNewsletter({
      email: 'attention@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-attention',
      now,
      fetchImpl,
    })
    expect(paused).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(attention).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(paused.message).not.toMatch(/paused|needs_attention/i)
    expect(attention.message).not.toMatch(/paused|needs_attention/i)
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'bad@example.com')))[0]?.status).toBe(
      FAILED_SUBSCRIBER_STATUS,
    )
    await close()
  })

  it('leaves an unsubscribed re-signup unsubscribed with no post and keeps those rows out of backfill', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 9_000_000
    await db.insert(subscribers).values({
      email: 'return@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: 'sub_old',
      status: UNSUBSCRIBED_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    await db.insert(subscribers).values({
      email: 'stuck-out@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response(JSON.stringify({ data: { id: 'sub_again' } }), { status: 201 })
      }
      return new Response(JSON.stringify({ data: { id: 'sub_remote_out', status: 'unsubscribed' } }), { status: 200 })
    }
    const reconciled = await reconcileStuckSubscribers({ db, apply: true, now, fetchImpl })
    expect(reconciled).toMatchObject({ stale: 1, synced: 0, optedOut: 1, terminal: 0, failed: 0 })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'stuck-out@example.com')))[0]?.status).toBe(
      UNSUBSCRIBED_SUBSCRIBER_STATUS,
    )
    const backfill = await backfillPendingSubscribers({ db, apply: true, now, fetchImpl })
    expect(backfill).toMatchObject({ pending: 0, synced: 0, failed: 0 })
    expect(posts).toBe(0)
    const signup = await subscribeToNewsletter({
      email: 'return@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-resubscribe',
      now,
      fetchImpl,
    })
    expect(signup).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(signup.message).not.toMatch(/unsubscribed|check your email/i)
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'return@example.com')))[0]).toMatchObject({
      status: UNSUBSCRIBED_SUBSCRIBER_STATUS,
      beehiivId: 'sub_old',
    })
    expect(await countSyncedSubscribers(db)).toBe(0)
    const repeat = await subscribeToNewsletter({
      email: 'return@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-resubscribe-again',
      now: now + 1,
      fetchImpl,
    })
    expect(repeat).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(posts).toBe(0)
    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const unset = await subscribeToNewsletter({
      email: 'return@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-resubscribe-unset',
      now: now + 2,
      fetchImpl,
    })
    expect(unset).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'return@example.com')))[0]?.status).toBe(
      UNSUBSCRIBED_SUBSCRIBER_STATUS,
    )
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('does not post an unsubscribed re-signup and records a stale unsubscribed lookup without claiming', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 4_000
    await db.insert(subscribers).values({
      email: 'return@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: UNSUBSCRIBED_SUBSCRIBER_STATUS,
    })
    await db.insert(subscribers).values({
      email: 'stale-out@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response('no', { status: 500 })
      }
      expect(String(input)).toContain(encodeURIComponent('stale-out@example.com'))
      return new Response(JSON.stringify({ data: { id: 'sub_stale_out', status: 'unsubscribed' } }), { status: 200 })
    }
    const signup = await subscribeToNewsletter({
      email: 'return@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-resubscribe-fail',
      now,
      fetchImpl,
    })
    expect(signup).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(signup.message).not.toMatch(/unsubscribed|check your email/i)
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'return@example.com')))[0]?.status).toBe(
      UNSUBSCRIBED_SUBSCRIBER_STATUS,
    )
    const backfill = await backfillPendingSubscribers({ db, apply: true, now, fetchImpl })
    expect(backfill).toMatchObject({ pending: 0, synced: 0, failed: 0 })
    expect(posts).toBe(0)
    const stale = await subscribeToNewsletter({
      email: 'stale-out@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-stale-unsubscribed',
      now,
      fetchImpl,
    })
    expect(stale).toEqual({ status: 'error', message: ADD_FAILED, tracked: false })
    expect(stale.message).not.toMatch(/unsubscribed|check your email/i)
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'stale-out@example.com')))[0]).toMatchObject({
      status: UNSUBSCRIBED_SUBSCRIBER_STATUS,
      beehiivId: 'sub_stale_out',
      syncingStartedAt: null,
    })
    expect(await countSyncedSubscribers(db)).toBe(0)
    await close()
  })

  it('parks an empty Beehiiv status on reconcile and on a stale signup, and floors a short stuck window', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const now = 2_000_000
    await db.insert(subscribers).values({
      email: 'blank@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - 30_000,
    })
    await db.insert(subscribers).values({
      email: 'old@example.com',
      createdAt: 1,
      destination: 'local',
      beehiivId: null,
      status: SYNCING_SUBSCRIBER_STATUS,
      syncingStartedAt: now - 60_000,
    })
    let posts = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      if (init?.method === 'POST') {
        posts += 1
        return new Response('{}', { status: 201 })
      }
      const url = String(input)
      if (url.includes(encodeURIComponent('old@example.com'))) {
        return new Response(JSON.stringify({ data: { id: 'sub_old_blank', status: ' ' } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { id: 'sub_blank' } }), { status: 200 })
    }
    const tooSoon = await reconcileStuckSubscribers({ db, apply: true, now, staleAfterMs: 1, fetchImpl })
    expect(tooSoon).toMatchObject({ stale: 1, terminal: 1, failed: 0 })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'blank@example.com')))[0]?.status).toBe(
      SYNCING_SUBSCRIBER_STATUS,
    )
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'old@example.com')))[0]).toMatchObject({
      status: FAILED_SUBSCRIBER_STATUS,
      beehiivStatus: '',
    })
    await db
      .update(subscribers)
      .set({ status: SYNCING_SUBSCRIBER_STATUS, beehiivStatus: null, beehiivId: null, syncingStartedAt: null })
      .where(eq(subscribers.email, 'blank@example.com'))
    const signup = await subscribeToNewsletter({
      email: 'blank@example.com',
      honeypot: '',
      db,
      rateKey: 'newsletter-blank-status',
      now: now + 60_000,
      fetchImpl,
    })
    expect(signup).toEqual({ status: 'error', message: FAILED_NOTICE, tracked: false })
    expect(posts).toBe(0)
    expect((await db.select().from(subscribers).where(eq(subscribers.email, 'blank@example.com')))[0]).toMatchObject({
      status: FAILED_SUBSCRIBER_STATUS,
      beehiivStatus: '',
    })
    await close()
  })
})
