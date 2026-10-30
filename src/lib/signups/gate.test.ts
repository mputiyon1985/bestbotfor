import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'
import { hashPassword } from '@/lib/signups/auth/password'
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/signups/auth/session'
import { issueSignupsSession } from '@/lib/signups/auth/session-store'
import { withSignupsAuthDb } from '@/lib/signups/auth/fixture-db'
import { base32Encode } from '@/lib/signups/auth/totp'
import { decideSignupsGate } from '@/lib/signups/gate'
import { ROBOTS_HEADER } from '@/lib/signups/privacy'
import { SIGNUPS_EXPORT, SIGNUPS_HOME, SIGNUPS_LOGIN, SIGNUPS_LOGOUT } from '@/lib/signups/paths'

const SECRET = 'test-session-secret-value-32bytes-ok'
const event = { waitUntil() {} }

function configure() {
  process.env.SIGNUPS_SESSION_SECRET = SECRET
  process.env.SIGNUPS_ADMIN_PASSWORD_HASH = hashPassword('test-password-value')
  process.env.SIGNUPS_TOTP_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
}

function clearAuth() {
  delete process.env.SIGNUPS_SESSION_SECRET
  delete process.env.SIGNUPS_ADMIN_PASSWORD_HASH
  delete process.env.SIGNUPS_TOTP_SECRET
}

beforeEach(() => {
  configure()
})

afterEach(() => {
  clearAuth()
})

async function run(path: string, cookie?: string) {
  const headers = new Headers()
  if (cookie) headers.set('cookie', cookie)
  const response = await proxy(new NextRequest(`https://dash.example${path}`, { headers }), event as never)
  if (!response) throw new Error(`proxy returned no response for ${path}`)
  return response
}

describe('signups proxy gating', () => {
  it('redirects anonymous requests and sets the robots header', async () => {
    const response = await run(SIGNUPS_HOME)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_LOGIN}`)
    expect(response.headers.get('x-robots-tag')).toBe(ROBOTS_HEADER)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })

  it('blocks data routes without a session', async () => {
    for (const path of [SIGNUPS_EXPORT, SIGNUPS_LOGOUT]) {
      const response = await run(path)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_LOGIN}`)
    }
  })

  it('allows login without a session and leaves public routes alone', async () => {
    for (const path of [SIGNUPS_LOGIN, `${SIGNUPS_LOGIN}/submit`]) {
      const response = await run(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-robots-tag')).toBe(ROBOTS_HEADER)
    }
    for (const path of ['/', '/robots.txt', '/_next/static/app.js', '/favicon.ico']) {
      const decision = await decideSignupsGate(new NextRequest(`https://dash.example${path}`))
      expect(decision.action).toBe('skip')
    }
    const home = await run('/')
    expect(home.headers.get('location') ?? '').not.toContain('/admin/signups')
  })

  it('allows a valid session through', async () => {
    const closeDb = await withSignupsAuthDb()
    try {
      const { token } = await issueSignupsSession(SECRET)
      const response = await run(SIGNUPS_HOME, `${SESSION_COOKIE}=${token}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-robots-tag')).toBe(ROBOTS_HEADER)
      expect(response.headers.get('x-bbf-signups')).toBeNull()
    } finally {
      await closeDb()
    }
  })

  it('redirects a trailing slash with noindex and no-store', async () => {
    const response = await run(`${SIGNUPS_HOME}/`)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_HOME}`)
    expect(response.headers.get('x-robots-tag')).toBe(ROBOTS_HEADER)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('rejects an expired session cookie', async () => {
    const issuedAt = Date.now() - SESSION_TTL_MS - 5_000
    const { token } = await createSessionToken(SECRET, issuedAt)
    const response = await run(SIGNUPS_EXPORT, `${SESSION_COOKIE}=${token}`)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`https://dash.example${SIGNUPS_LOGIN}`)
  })

  it('sets a Secure login CSRF cookie on GET /admin/signups/login', async () => {
    const response = await run(SIGNUPS_LOGIN)
    const cookie = response.headers.getSetCookie().join(';')
    expect(cookie).toContain('signups_login_csrf=')
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('secure')
    expect(cookie.toLowerCase()).toContain('samesite=strict')
    expect(cookie.toLowerCase()).toContain('path=/admin/signups/login')
  })

  it('404s every signups path when the admin secrets are unset', async () => {
    clearAuth()
    for (const path of [SIGNUPS_HOME, '/Admin/Signups', '/admin/%73ignups', SIGNUPS_LOGIN, SIGNUPS_EXPORT, SIGNUPS_LOGOUT]) {
      const response = await run(path)
      expect(response.status, path).toBe(404)
      expect(await response.text()).toBe('Not found.')
      expect(response.headers.get('x-robots-tag'), path).toMatch(/noindex/i)
      expect(response.headers.get('cache-control'), path).toContain('no-store')
    }
  })
})
