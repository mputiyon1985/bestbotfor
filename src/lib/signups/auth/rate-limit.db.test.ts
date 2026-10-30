import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withSignupsAuthDb } from './fixture-db'
import { signupsLoginBucket } from './cookies'
import { clearLoginFailures, loginIsLimited, recordLoginFailure } from './store'

const SECRET = 'test-session-secret-value-32bytes-ok'

function request(vercelIp: string | null, forwardedFor: string) {
  const headers = new Headers({ 'x-forwarded-for': forwardedFor })
  if (vercelIp) headers.set('x-vercel-forwarded-for', vercelIp)
  return new Request('https://dash.example/admin/signups/login/submit', { headers })
}

describe('shared login rate limit', () => {
  let closeDb: (() => Promise<void>) | undefined

  beforeEach(async () => {
    closeDb = await withSignupsAuthDb()
  })

  afterEach(async () => {
    await closeDb?.()
  })

  it('keys on x-vercel-forwarded-for and ignores a spoofed x-forwarded-for', () => {
    const left = signupsLoginBucket(request('203.0.113.10', '198.51.100.1'), SECRET)
    const right = signupsLoginBucket(request('203.0.113.10', '198.51.100.99'), SECRET)
    const spoofed = signupsLoginBucket(request(null, '203.0.113.10'), SECRET)
    expect(left).toBe(right)
    expect(spoofed).not.toBe(left)
  })

  it('remembers failures in the site database', async () => {
    const bucket = signupsLoginBucket(request('203.0.113.10', '1.2.3.4'), SECRET)
    const other = signupsLoginBucket(request('203.0.113.11', '1.2.3.4'), SECRET)
    for (let attempt = 0; attempt < 8; attempt++) await recordLoginFailure(bucket)
    expect(await loginIsLimited(bucket)).toBe(true)
    expect(await loginIsLimited(other)).toBe(false)
    await clearLoginFailures(bucket)
    expect(await loginIsLimited(bucket)).toBe(false)
  })
})
