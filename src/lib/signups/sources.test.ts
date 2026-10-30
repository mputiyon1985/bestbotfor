import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCacheForTests } from '@/lib/signups/cache'
import { combineSignups, loadAllSources } from '@/lib/signups/sources/load'
import { subscriberQuery } from '@/lib/signups/sources/turso'

const libsql = vi.hoisted(() => {
  const execute = vi.fn()
  const close = vi.fn()
  const createClient = vi.fn(() => ({ execute, close }))
  return { execute, close, createClient }
})

const nextCache = vi.hoisted(() => ({
  unstable_cache: vi.fn((fn: () => Promise<unknown>) => fn),
}))

vi.mock('@libsql/client', () => ({
  createClient: libsql.createClient,
}))

vi.mock('next/cache', () => nextCache)

const ENV_KEYS = [
  'SIGNUPS_TURSO_DATABASE_URL',
  'SIGNUPS_TURSO_AUTH_TOKEN',
  'SIGNUPS_TURSO_TABLE',
  'SIGNUPS_TURSO_EMAIL_COLUMN',
  'SIGNUPS_TURSO_CREATED_COLUMN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'BEEHIIV_API_KEY',
  'BEEHIIV_PUBLICATION_ID',
  'CLERK_SECRET_KEY',
] as const

const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  clearEnv()
  resetCacheForTests()
  libsql.execute.mockReset()
  libsql.close.mockReset()
  libsql.createClient.mockReset()
  libsql.createClient.mockImplementation(() => ({
    execute: libsql.execute,
    close: libsql.close,
  }))
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  restoreEnv()
  resetCacheForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sources', () => {
  it('builds one read-only query and ignores unsafe column names', () => {
    const loader = readFileSync(path.join(process.cwd(), 'src/lib/signups/sources/load.ts'), 'utf8')
    expect(loader).toContain("cached('signups-turso'")
    expect(loader).toContain("cached('signups-beehiiv'")
    expect(loader).toContain("cached('signups-clerk'")
    expect(subscriberQuery({})).toBe(
      'SELECT "email" AS email, "created_at" AS created_at FROM "subscribers" ORDER BY "created_at" DESC LIMIT 5000',
    )
    expect(
      subscriberQuery({
        SIGNUPS_TURSO_TABLE: 'newsletter_subscribers',
        SIGNUPS_TURSO_EMAIL_COLUMN: 'email_address',
        SIGNUPS_TURSO_CREATED_COLUMN: 'subscribed_at',
      }),
    ).toContain('"email_address"')
    const injected = subscriberQuery({
      SIGNUPS_TURSO_EMAIL_COLUMN: 'email; drop table subscribers',
      SIGNUPS_TURSO_TABLE: 'subscribers; delete from subscribers',
    })
    expect(injected).not.toContain(';')
    expect(injected.toLowerCase()).not.toContain('drop')
    expect(injected.toLowerCase()).not.toContain('delete')
    expect(injected).toContain('"email"')
    expect(injected).toContain('"subscribers"')
  })

  it('keeps the other sources when Beehiiv fails and does not use the site database', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://site-database.invalid'
    process.env.TURSO_AUTH_TOKEN = 'site-token'
    process.env.SIGNUPS_TURSO_DATABASE_URL = 'libsql://example.invalid'
    process.env.SIGNUPS_TURSO_AUTH_TOKEN = 'read-only-token'
    process.env.BEEHIIV_API_KEY = 'beehiiv_test_key'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_123'
    process.env.CLERK_SECRET_KEY = 'clerk_test_key'
    libsql.execute.mockResolvedValue({
      rows: [{ email: 'a@example.com', created_at: '2026-02-01 00:00:00' }],
    })
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input)
      expect((init?.method ?? 'GET').toUpperCase()).toBe('GET')
      if (url.includes('beehiiv.com')) return new Response('nope', { status: 500 })
      if (url.includes('/v1/users/count')) return jsonResponse({ total_count: 2 })
      if (url.includes('api.clerk.com/v1/users')) {
        return jsonResponse([
          {
            primary_email_address_id: 'idn_1',
            email_addresses: [{ id: 'idn_1', email_address: 'c@example.com' }],
            created_at: 1767225600000,
          },
        ])
      }
      throw new Error('unexpected url')
    })
    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })

    const results = await loadAllSources()
    const bySource = Object.fromEntries(results.map((result) => [result.source, result]))
    expect(bySource.turso?.ok).toBe(true)
    expect(bySource.turso?.signups[0]?.email).toBe('a@example.com')
    expect(bySource.beehiiv?.ok).toBe(false)
    expect(bySource.beehiiv?.signups).toEqual([])
    expect(bySource.clerk?.ok).toBe(true)
    expect(bySource.clerk?.total).toBe(2)
    expect(bySource.clerk?.signups[0]?.email).toBe('c@example.com')
    expect(libsql.createClient).toHaveBeenCalledWith({ url: 'libsql://example.invalid', authToken: 'read-only-token' })
    expect(libsql.execute).toHaveBeenCalledTimes(1)
    const sql = String(libsql.execute.mock.calls[0]?.[0])
    expect(sql.startsWith('SELECT ')).toBe(true)
    expect(sql).toContain('LIMIT 5000')

    const logged = JSON.stringify(errors)
    expect(logged).not.toContain('a@example.com')
    expect(logged).not.toContain('c@example.com')
    expect(logged).not.toContain('read-only-token')
    expect(logged).not.toContain('beehiiv_test_key')
    expect(logged).not.toContain('clerk_test_key')
  })

  it('keeps the other sources when Turso throws', async () => {
    process.env.SIGNUPS_TURSO_DATABASE_URL = 'libsql://example.invalid'
    process.env.SIGNUPS_TURSO_AUTH_TOKEN = 'read-only-token'
    process.env.BEEHIIV_API_KEY = 'beehiiv_test_key'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_123'
    process.env.CLERK_SECRET_KEY = 'clerk_test_key'
    libsql.execute.mockRejectedValue(new Error('database unavailable'))
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('beehiiv.com')) {
        return jsonResponse({
          data: [{ email: 'b@example.com', created: 1767225600 }],
          total_results: 1,
          total_pages: 1,
        })
      }
      if (url.includes('/v1/users/count')) return jsonResponse({ total_count: 0 })
      if (url.includes('api.clerk.com/v1/users')) return jsonResponse([])
      throw new Error('unexpected url')
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const results = await loadAllSources()
    const bySource = Object.fromEntries(results.map((result) => [result.source, result]))
    expect(bySource.turso?.ok).toBe(false)
    expect(bySource.beehiiv?.ok).toBe(true)
    expect(bySource.beehiiv?.signups[0]?.email).toBe('b@example.com')
    expect(bySource.clerk?.ok).toBe(true)
    expect(bySource.clerk?.signups).toEqual([])
    expect(errors.mock.calls.flat().join(' ')).not.toContain('database unavailable')
  })

  it('keeps the other sources when Clerk fails and when env vars are missing', async () => {
    process.env.SIGNUPS_TURSO_DATABASE_URL = 'libsql://example.invalid'
    process.env.SIGNUPS_TURSO_AUTH_TOKEN = 'read-only-token'
    process.env.BEEHIIV_API_KEY = 'beehiiv_test_key'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_123'
    process.env.CLERK_SECRET_KEY = 'clerk_test_key'
    libsql.execute.mockResolvedValue({ rows: [] })
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('beehiiv.com')) return jsonResponse({ data: [], total_results: 0, total_pages: 1 })
      throw new Error('clerk down')
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const missingClerk = await loadAllSources()
    expect(missingClerk.find((result) => result.source === 'clerk')?.ok).toBe(false)
    expect(missingClerk.find((result) => result.source === 'turso')?.ok).toBe(true)
    expect(missingClerk.find((result) => result.source === 'beehiiv')?.ok).toBe(true)
    expect(errors.mock.calls.flat().join(' ')).not.toContain('clerk down')

    resetCacheForTests()
    clearEnv()
    const allMissing = await loadAllSources()
    expect(allMissing.every((result) => result.ok === false)).toBe(true)
    expect(libsql.createClient).toHaveBeenCalledTimes(1)
  })

  it('does not refetch a source within 300 seconds', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv_test_key'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_123'
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      expect(url).toContain('page=1')
      return jsonResponse({
        data: [{ email: 'b@example.com', created: 1767225600 }],
        total_results: 1,
        total_pages: 1,
      })
    })
    const first = await loadAllSources()
    const second = await loadAllSources()
    expect(first[1]?.signups).toEqual(second[1]?.signups)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sorts the combined list newest first', () => {
    const rows = combineSignups([
      {
        source: 'turso',
        ok: true,
        capped: false,
        total: 1,
        signups: [{ source: 'turso', email: 'old@example.com', createdAt: '2026-01-01T00:00:00.000Z' }],
      },
      {
        source: 'beehiiv',
        ok: true,
        capped: false,
        total: 1,
        signups: [{ source: 'beehiiv', email: 'new@example.com', createdAt: '2026-03-01T00:00:00.000Z' }],
      },
      { source: 'clerk', ok: false, capped: false, total: null, signups: [] },
    ])
    expect(rows.map((row) => row.email)).toEqual(['new@example.com', 'old@example.com'])
  })
})
