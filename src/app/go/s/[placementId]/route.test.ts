import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const jobs = vi.hoisted(() => [] as Array<() => Promise<void>>)
const limiter = vi.hoisted(() => ({ fail: null as Error | null }))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after(work: () => Promise<void>) {
      jobs.push(work)
    },
  }
})

vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
  return {
    ...actual,
    consumeRateLimit: (...args: Parameters<typeof actual.consumeRateLimit>) => {
      if (limiter.fail) return Promise.reject(limiter.fail)
      return actual.consumeRateLimit(...args)
    },
  }
})

import { GET } from './route'
import { getDb, resetDbCache } from '@/lib/db/client'
import { applyMigrations } from '@/lib/db/migrate'
import { sponsorshipCreatives, sponsorshipDailyCounts, sponsorships } from '@/lib/db/schema'
import { rateLimitKey } from '@/lib/ip'
import { consumeRateLimit } from '@/lib/rate-limit'

const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const WEEK = 7 * 24 * 60 * 60 * 1000
const ENV_KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'RATE_LIMIT_HMAC_SECRET'] as const
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

let directory = ''

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-sponsor-go-'))
  process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'go.db')}`
  process.env.TURSO_AUTH_TOKEN = 'local'
  process.env.RATE_LIMIT_HMAC_SECRET = 'route-test-rate-limit-hmac-secret-40b'
  resetDbCache()
  await applyMigrations(process.env.TURSO_DATABASE_URL)
})

afterAll(async () => {
  getDb().$client.close()
  resetDbCache()
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function insertPlacement(input: {
  offering?: string
  status?: string
  paidAt?: number | null
  refundedAt?: number | null
  creativeStatus?: string
  approvedUrl?: string | null
} = {}): Promise<number> {
  const now = Date.now()
  const db = getDb()
  const inserted = await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: `cs_${Math.random().toString(16).slice(2)}`,
      offering: input.offering ?? 'placement_weekly',
      status: input.status ?? 'paid',
      company: 'Example Tools',
      email: 'sponsor@example.com',
      taskSlug: 'coding',
      createdAt: now,
      updatedAt: now,
      paidAt: input.paidAt === undefined ? now - 1_000 : input.paidAt,
      refundedAt: input.refundedAt ?? null,
    })
    .returning({ id: sponsorships.id })
  const id = inserted[0]?.id
  if (!id) throw new Error('missing sponsorship')
  const approved = (input.creativeStatus ?? 'approved') === 'approved'
  const url = input.approvedUrl === undefined ? 'https://example.com/widget' : input.approvedUrl
  await db.insert(sponsorshipCreatives).values({
    sponsorshipId: id,
    toolName: 'Widget',
    description: 'A useful coding tool.',
    url: url ?? 'https://example.com/widget',
    logoMime: 'image/png',
    logoBytes: PNG,
    status: input.creativeStatus ?? 'approved',
    approvedToolName: approved ? 'Widget' : null,
    approvedDescription: approved ? 'A useful coding tool.' : null,
    approvedUrl: approved ? url : null,
    approvedLogoMime: approved ? 'image/png' : null,
    approvedLogoBytes: approved ? PNG : null,
    approvedContentHash: approved ? 'b'.repeat(64) : null,
    approvedVersion: approved ? 1 : null,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

function request(id: string, input: { method?: string; ip?: string; headers?: Record<string, string>; search?: string } = {}) {
  const headers = new Headers(input.headers)
  if (input.ip) headers.set('x-forwarded-for', input.ip)
  if (!headers.has('user-agent')) headers.set('user-agent', HUMAN_UA)
  return new Request(`https://bestbotfor.com/go/s/${id}${input.search ?? ''}`, {
    method: input.method ?? 'GET',
    headers,
  })
}

async function call(id: string, input?: Parameters<typeof request>[1]) {
  jobs.length = 0
  const response = await GET(request(id, input), { params: Promise.resolve({ placementId: id }) })
  await Promise.all(jobs.splice(0).map((job) => job()))
  return response
}

async function clicks(id: number): Promise<number> {
  const rows = await getDb().select().from(sponsorshipDailyCounts).where(eq(sponsorshipDailyCounts.sponsorshipId, id))
  return rows.reduce((sum, row) => sum + row.goClicks, 0)
}

describe('GET /go/s/[placementId]', () => {
  it('redirects a human GET only to the approved card URL and counts that click', async () => {
    const id = await insertPlacement()
    const response = await call(String(id), {
      ip: '203.0.113.10',
      search: '?next=https://evil.example&url=https://evil.example',
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/widget')
    expect(response.headers.get('location')).not.toContain('evil.example')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await clicks(id)).toBe(1)
  })

  it('still redirects HEAD, prefetch, and bot requests without counting them', async () => {
    const id = await insertPlacement()
    const head = await call(String(id), { ip: '203.0.113.11', method: 'HEAD' })
    const proxyHead = await call(String(id), {
      ip: '203.0.113.12',
      headers: { 'x-bbf-method': 'HEAD', 'user-agent': HUMAN_UA },
    })
    const prefetch = await call(String(id), {
      ip: '203.0.113.13',
      headers: { purpose: 'prefetch', 'user-agent': HUMAN_UA },
    })
    const bot = await call(String(id), {
      ip: '203.0.113.14',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    })
    for (const response of [head, proxyHead, prefetch, bot]) {
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://example.com/widget')
    }
    expect(await clicks(id)).toBe(0)
  })

  it('answers 404 for a missing, unpaid, refunded, expired, or unapproved card and ignores the query', async () => {
    const now = Date.now()
    const cases = [
      '999999',
      '0',
      '01',
      '999999999999999999',
      String(await insertPlacement({ status: 'pending', paidAt: null })),
      String(await insertPlacement({ refundedAt: now })),
      String(await insertPlacement({ paidAt: now - WEEK - 1 })),
      String(await insertPlacement({ creativeStatus: 'pending' })),
      String(await insertPlacement({ creativeStatus: 'rejected' })),
      String(await insertPlacement({ approvedUrl: 'javascript:alert(1)' })),
      String(await insertPlacement({ approvedUrl: 'http://example.com/widget' })),
      String(await insertPlacement({ offering: 'newsletter_slot' })),
    ]
    for (const id of cases) {
      const response = await call(id, { ip: `203.0.113.${20 + cases.indexOf(id)}`, search: '?url=https://evil.example' })
      expect(response.status, id).toBe(404)
      expect(await response.text()).toBe('That sponsored placement is not available.')
      expect(response.headers.get('location')).toBeNull()
    }
  })

  it('returns 429 when the window is full and does not count that request', async () => {
    const id = await insertPlacement()
    const ip = '203.0.113.60'
    const db = getDb()
    for (let n = 0; n < 60; n += 1) {
      const result = await consumeRateLimit(db, rateLimitKey(ip, 'sponsor-go'), 60, 60_000)
      expect(result.ok).toBe(true)
    }
    const response = await call(String(id), { ip })
    expect(response.status).toBe(429)
    expect(await response.text()).toBe('Too many clicks from this network. Try again in a minute.')
    expect(await clicks(id)).toBe(0)
  })

  it('still redirects when the limiter throws and does not log the error message', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    limiter.fail = new Error('sponsor@example.com')
    try {
      const id = await insertPlacement()
      const response = await call(String(id), { ip: '203.0.113.70' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://example.com/widget')
      expect(await clicks(id)).toBe(1)
      expect(errorLog).toHaveBeenCalledWith('sponsor go rate limit failed', 'Error')
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sponsor@example.com')
    } finally {
      limiter.fail = null
      errorLog.mockRestore()
    }
  })
})
