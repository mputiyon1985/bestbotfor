import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { withSignupsAuthDb } from './fixture-db'
import { signupsLoginBucket, signupsRunsOnVercel } from './cookies'
import { clearLoginFailures, loginIsLimited, recordLoginFailure } from './store'

const SECRET = 'test-session-secret-value-32bytes-ok'
const VERCEL_KEYS = ['VERCEL', 'VERCEL_ENV', 'VERCEL_REGION'] as const

function request(vercelIp: string | null, forwardedFor: string) {
  const headers = new Headers({ 'x-forwarded-for': forwardedFor })
  if (vercelIp !== null) headers.set('x-vercel-forwarded-for', vercelIp)
  return new Request('https://dash.example/admin/signups/login/submit', { headers })
}

function onVercel(region?: string) {
  process.env.VERCEL = '1'
  process.env.VERCEL_ENV = 'production'
  if (region === undefined) delete process.env.VERCEL_REGION
  else process.env.VERCEL_REGION = region
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

  it('ignores a client-supplied trusted-IP header off Vercel', () => {
    expect(signupsRunsOnVercel()).toBe(false)
    const supplied = signupsLoginBucket(request('203.0.113.10', '198.51.100.1'), SECRET)
    const other = signupsLoginBucket(request('203.0.113.11', '198.51.100.99'), SECRET)
    const spoofed = signupsLoginBucket(request(null, '203.0.113.10'), SECRET)
    expect(supplied).toEqual({ action: 'skip' })
    expect(other).toEqual({ action: 'skip' })
    expect(spoofed).toEqual({ action: 'skip' })
  })

  it('keeps the limit on when VERCEL_REGION is unset and refuses a missing address', () => {
    onVercel()
    expect(signupsRunsOnVercel()).toBe(true)
    const left = signupsLoginBucket(request('203.0.113.10', '198.51.100.1'), SECRET)
    const right = signupsLoginBucket(request('203.0.113.10', '198.51.100.99'), SECRET)
    const other = signupsLoginBucket(request('203.0.113.11', '1.2.3.4'), SECRET)
    expect(left).toEqual(right)
    expect(left.action).toBe('limit')
    if (other.action !== 'limit' || left.action !== 'limit') throw new Error('expected a bucket')
    expect(other.bucket).not.toBe(left.bucket)
    expect(signupsLoginBucket(request(null, '203.0.113.10'), SECRET)).toEqual({ action: 'refuse' })
    expect(signupsLoginBucket(request('', '198.51.100.8'), SECRET)).toEqual({ action: 'refuse' })
  })

  it('treats preview without a region as Vercel', () => {
    delete process.env.VERCEL
    delete process.env.VERCEL_REGION
    process.env.VERCEL_ENV = 'preview'
    expect(signupsLoginBucket(request(null, '203.0.113.10'), SECRET)).toEqual({ action: 'refuse' })
  })

  it('remembers failures in the site database and stops the counter at 8', async () => {
    onVercel()
    const limited = signupsLoginBucket(request('203.0.113.10', '1.2.3.4'), SECRET)
    const other = signupsLoginBucket(request('203.0.113.11', '1.2.3.4'), SECRET)
    if (limited.action !== 'limit' || other.action !== 'limit') throw new Error('expected a login bucket')
    for (let attempt = 0; attempt < 20; attempt++) await recordLoginFailure(limited.bucket)
    expect(await loginIsLimited(limited.bucket)).toBe(true)
    expect(await loginIsLimited(other.bucket)).toBe(false)
    const row = await getDb().$client.execute({
      sql: 'SELECT failures FROM signups_login_attempts WHERE bucket = ?',
      args: [limited.bucket],
    })
    expect(Number(row.rows[0]?.failures)).toBe(8)
    await clearLoginFailures(limited.bucket)
    expect(await loginIsLimited(limited.bucket)).toBe(false)
  })
})
