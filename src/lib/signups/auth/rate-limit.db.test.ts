import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { withSignupsAuthDb } from './fixture-db'
import { signupsLoginBucket } from './cookies'
import { clearLoginFailures, consumeLoginAttempt } from './store'

const SECRET = 'test-session-secret-value-32bytes-ok'
const VERCEL_KEYS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_REGION'] as const

function request(vercelIp: string | null, forwardedFor: string) {
  const headers = new Headers({ 'x-forwarded-for': forwardedFor })
  if (vercelIp) headers.set('x-vercel-forwarded-for', vercelIp)
  return new Request('https://dash.example/admin/signups/login/submit', { headers })
}

describe('shared login rate limit', () => {
  let closeDb: (() => Promise<void>) | undefined
  const original = Object.fromEntries(VERCEL_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

  beforeEach(async () => {
    closeDb = await withSignupsAuthDb()
    for (const key of VERCEL_KEYS) delete process.env[key]
  })

  afterEach(async () => {
    await closeDb?.()
    for (const key of VERCEL_KEYS) {
      const value = original[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('keys on x-vercel-forwarded-for and ignores a spoofed x-forwarded-for', () => {
    const left = signupsLoginBucket(request('203.0.113.10', '198.51.100.1'), SECRET)
    const right = signupsLoginBucket(request('203.0.113.10', '198.51.100.99'), SECRET)
    const spoofed = signupsLoginBucket(request(null, '203.0.113.10'), SECRET)
    expect(left).toEqual(right)
    expect(left.action).toBe('limit')
    expect(spoofed).toEqual({ action: 'skip' })
  })

  it('refuses a missing trusted IP on Vercel and does not share one bucket', () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_REGION = 'iad1'
    const first = signupsLoginBucket(request(null, '203.0.113.10'), SECRET)
    const second = signupsLoginBucket(request('', '198.51.100.8'), SECRET)
    expect(first).toEqual({ action: 'refuse' })
    expect(second).toEqual({ action: 'refuse' })
  })

  it('remembers failures in the site database and caps a parallel burst at 8', async () => {
    const limited = signupsLoginBucket(request('203.0.113.10', '1.2.3.4'), SECRET)
    const other = signupsLoginBucket(request('203.0.113.11', '1.2.3.4'), SECRET)
    if (limited.action !== 'limit' || other.action !== 'limit') throw new Error('expected a login bucket')
    for (let attempt = 0; attempt < 8; attempt++) expect(await consumeLoginAttempt(limited.bucket)).toBe(true)
    expect(await consumeLoginAttempt(limited.bucket)).toBe(false)
    expect(await consumeLoginAttempt(other.bucket)).toBe(true)
    await clearLoginFailures(limited.bucket)
    expect(await consumeLoginAttempt(limited.bucket)).toBe(true)

    const burstBucket = signupsLoginBucket(request('203.0.113.20', '1.2.3.4'), SECRET)
    if (burstBucket.action !== 'limit') throw new Error('expected a burst bucket')
    const burst = await Promise.all(Array.from({ length: 20 }, () => consumeLoginAttempt(burstBucket.bucket)))
    expect(burst.filter(Boolean)).toHaveLength(8)
  })

  it('deletes attempt rows from an expired window', async () => {
    const db = getDb().$client
    const stale = Date.now() - 16 * 60 * 1000
    await db.execute({
      sql: 'INSERT INTO signups_login_attempts (bucket, failures, window_start) VALUES (?, ?, ?)',
      args: ['stale-bucket', 4, stale],
    })
    const current = signupsLoginBucket(request('203.0.113.30', '1.2.3.4'), SECRET)
    if (current.action !== 'limit') throw new Error('expected a login bucket')
    expect(await consumeLoginAttempt(current.bucket)).toBe(true)
    const left = await db.execute({
      sql: 'SELECT bucket FROM signups_login_attempts WHERE bucket = ?',
      args: ['stale-bucket'],
    })
    expect(left.rows).toHaveLength(0)
  })
})
