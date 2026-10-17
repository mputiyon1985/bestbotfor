import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribers } from './db/schema'
import type { Database } from './db/client'
import { subscribeToNewsletter } from './newsletter'
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
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'person@example.com',
      honeypot: 'https://spam.example',
      db,
      rateKey: 'newsletter-honey',
      now: 1_000,
    })
    expect(result).toEqual({ status: 'success', message: "Thanks. You're on the list.", tracked: false })
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
    expect(result).toMatchObject({ status: 'success', tracked: true })
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: 'person@example.com', destination: 'local', beehiivId: null })
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
    expect(result.message).toContain('Too many')
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
})
