import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/admin/signups/login/submit/route'
import { getDb } from '@/lib/db'
import { withSignupsAuthDb } from '@/lib/signups/auth/fixture-db'
import { hashPassword } from '@/lib/signups/auth/password'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/signups/auth/session'
import { base32Encode, totpCode } from '@/lib/signups/auth/totp'
import { SIGNUPS_HOME, SIGNUPS_LOGIN } from '@/lib/signups/paths'

const SECRET = 'test-session-secret-value-32bytes-ok'
const PASSWORD = 'test-password-value'
const TOTP_KEY = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

function loginRequest(fields: Record<string, string>, ip = '203.0.113.10') {
  const body = new URLSearchParams({ csrf: 'csrf-token', ...fields })
  return new Request('https://dash.example/admin/signups/login/submit', {
    method: 'POST',
    headers: {
      origin: 'https://dash.example',
      host: 'dash.example',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: 'signups_login_csrf=csrf-token',
      'x-forwarded-for': '198.51.100.20',
      'x-vercel-forwarded-for': ip,
    },
    body,
  })
}

let closeDb: (() => Promise<void>) | undefined

beforeEach(async () => {
  closeDb = await withSignupsAuthDb()
  process.env.SIGNUPS_LOGIN_FAILURE_DELAY_MS = '0'
  process.env.SIGNUPS_ADMIN_PASSWORD_HASH = hashPassword(PASSWORD)
  process.env.SIGNUPS_TOTP_SECRET = TOTP_KEY
  process.env.SIGNUPS_SESSION_SECRET = SECRET
})

afterEach(async () => {
  await closeDb?.()
  delete process.env.SIGNUPS_LOGIN_FAILURE_DELAY_MS
  delete process.env.SIGNUPS_ADMIN_PASSWORD_HASH
  delete process.env.SIGNUPS_TOTP_SECRET
  delete process.env.SIGNUPS_SESSION_SECRET
})

describe('login', () => {
  it('sets a signed 12 hour cookie only when the password and code match', async () => {
    const code = totpCode(TOTP_KEY, Date.now())
    const response = await POST(loginRequest({ password: PASSWORD, code }))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_HOME}`)
    const cookie = response.headers.getSetCookie().join(';')
    expect(cookie).toContain(`${SESSION_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('secure')
    expect(cookie.toLowerCase()).toContain('samesite=strict')
    expect(cookie.toLowerCase()).toContain(`max-age=${SESSION_MAX_AGE_SECONDS}`)
    expect(cookie.toLowerCase()).toContain('path=/admin/signups')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('uses one generic error for a bad password, a bad code, and a bad origin', async () => {
    const code = totpCode(TOTP_KEY, Date.now())
    const badPassword = await POST(loginRequest({ password: 'nope-password-value', code }, '203.0.113.11'))
    const badCode = await POST(loginRequest({ password: PASSWORD, code: '000000' }, '203.0.113.12'))
    const badOrigin = await POST(
      new Request('https://dash.example/admin/signups/login/submit', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          host: 'dash.example',
          'content-type': 'application/x-www-form-urlencoded',
          cookie: 'signups_login_csrf=csrf-token',
          'x-forwarded-for': '203.0.113.13',
        },
        body: new URLSearchParams({ csrf: 'csrf-token', password: PASSWORD, code }),
      }),
    )
    for (const response of [badPassword, badCode, badOrigin]) {
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_LOGIN}?e=1`)
      expect(response.headers.getSetCookie().join(';')).not.toContain(`${SESSION_COOKIE}=`)
    }
  })

  it('lets a local request through when the trusted IP header is missing', async () => {
    const code = totpCode(TOTP_KEY, Date.now())
    const response = await POST(
      new Request('https://dash.example/admin/signups/login/submit', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          'content-type': 'application/x-www-form-urlencoded',
          cookie: 'signups_login_csrf=csrf-token',
          'x-forwarded-for': '203.0.113.40',
        },
        body: new URLSearchParams({ csrf: 'csrf-token', password: PASSWORD, code }),
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_HOME}`)
  })

  it('refuses a missing trusted IP on Vercel without writing a shared bucket', async () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_REGION = 'iad1'
    try {
      const code = totpCode(TOTP_KEY, Date.now())
      const response = await POST(
        new Request('https://dash.example/admin/signups/login/submit', {
          method: 'POST',
          headers: {
            origin: 'https://dash.example',
            host: 'dash.example',
            'content-type': 'application/x-www-form-urlencoded',
            cookie: 'signups_login_csrf=csrf-token',
            'x-forwarded-for': '203.0.113.41',
          },
          body: new URLSearchParams({ csrf: 'csrf-token', password: PASSWORD, code }),
        }),
      )
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_LOGIN}?e=1`)
      expect(response.headers.getSetCookie().join(';')).not.toContain(`${SESSION_COOKIE}=`)
      const rows = await getDb().$client.execute({ sql: 'SELECT COUNT(*) AS n FROM signups_login_attempts', args: [] })
      expect(Number(rows.rows[0]?.n)).toBe(0)
    } finally {
      delete process.env.VERCEL
      delete process.env.VERCEL_ENV
      delete process.env.VERCEL_REGION
    }
  })

  it('404s when the admin secrets are unset', async () => {
    delete process.env.SIGNUPS_SESSION_SECRET
    delete process.env.SIGNUPS_ADMIN_PASSWORD_HASH
    delete process.env.SIGNUPS_TOTP_SECRET
    const code = totpCode(TOTP_KEY, Date.now())
    const response = await POST(loginRequest({ password: PASSWORD, code }))
    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie().join(';')).not.toContain(`${SESSION_COOKIE}=`)
  })
})
