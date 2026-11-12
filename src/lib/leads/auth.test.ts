import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as login } from '@/app/admin/leads/login/route'
import { POST as logout } from '@/app/admin/leads/logout/route'
import { POST as importLeads } from '@/app/admin/leads/import/route'
import { getDb } from '@/lib/db'
import { withSignupsAuthDb } from '@/lib/signups/auth/fixture-db'
import { leadsPassword, leadsPasswordMatches } from '@/lib/leads/auth/password'
import { LEADS_LOGIN_LIMIT } from '@/lib/leads/auth/rate-limit'
import { createLeadsSessionToken, LEADS_SESSION_COOKIE, LEADS_SESSION_TTL_SECONDS, verifyLeadsSession } from '@/lib/leads/auth/session'
import { LEADS_HOME, LEADS_LIMIT_ERROR, LEADS_LOGIN_ERROR } from '@/lib/leads/paths'

const PASSWORD = 'test-leads-password-value'
const RATE_SECRET = 'ci-rate-limit-hmac-secret-value-40-bytes'

function loginRequest(password: string, ip = '203.0.113.20', extra: Record<string, string> = {}) {
  return new Request('https://dash.example/admin/leads/login', {
    method: 'POST',
    headers: {
      origin: 'https://dash.example',
      host: 'dash.example',
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': ip,
      ...extra,
    },
    body: new URLSearchParams({ password }),
  })
}

function cookieValue(response: Response): string {
  const header = response.headers.getSetCookie().find((item) => item.startsWith(`${LEADS_SESSION_COOKIE}=`)) ?? ''
  const pair = header.split(';')[0] ?? ''
  const value = pair.slice(pair.indexOf('=') + 1)
  return value ? decodeURIComponent(value) : ''
}

let closeDb: (() => Promise<void>) | undefined
let previousRate: string | undefined
let previousVercel: string | undefined
let previousVercelEnv: string | undefined

beforeEach(async () => {
  previousRate = process.env.RATE_LIMIT_HMAC_SECRET
  previousVercel = process.env.VERCEL
  previousVercelEnv = process.env.VERCEL_ENV
  process.env.RATE_LIMIT_HMAC_SECRET = RATE_SECRET
  process.env.BBF_LEADS_PASSWORD = PASSWORD
  delete process.env.VERCEL
  delete process.env.VERCEL_ENV
  closeDb = await withSignupsAuthDb()
})

afterEach(async () => {
  await closeDb?.()
  delete process.env.BBF_LEADS_PASSWORD
  if (previousRate === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET
  else process.env.RATE_LIMIT_HMAC_SECRET = previousRate
  if (previousVercel === undefined) delete process.env.VERCEL
  else process.env.VERCEL = previousVercel
  if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previousVercelEnv
})

describe('leads password', () => {
  it('matches in constant time and fails closed when unset', () => {
    expect(leadsPasswordMatches(PASSWORD, PASSWORD)).toBe(true)
    expect(leadsPasswordMatches('nope-leads-password', PASSWORD)).toBe(false)
    expect(leadsPasswordMatches('a', 'ab')).toBe(false)
    expect(leadsPasswordMatches('', '')).toBe(false)
    expect(leadsPasswordMatches(`${PASSWORD} `, PASSWORD)).toBe(false)
    expect(leadsPassword()).toBe(PASSWORD)
    expect(leadsPassword('   ')).toBeNull()
    expect(leadsPassword('')).toBeNull()
    const saved = process.env.BBF_LEADS_PASSWORD
    delete process.env.BBF_LEADS_PASSWORD
    expect(leadsPassword()).toBeNull()
    process.env.BBF_LEADS_PASSWORD = saved
    expect(leadsPassword('x'.repeat(257))).toBeNull()
    const source = readFileSync(path.join(process.cwd(), 'src/lib/leads/auth/password.ts'), 'utf8')
    expect(source).toContain('timingSafeEqual')
    expect(source).not.toContain('console.')
  })
})

describe('leads session', () => {
  it('rejects a tampered cookie, an expired cookie, and a rotated password', () => {
    const { token, session } = createLeadsSessionToken(PASSWORD, 1_700_000_000_000)
    expect(token).not.toContain(PASSWORD)
    expect(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8')).not.toContain(PASSWORD)
    expect(verifyLeadsSession(token, PASSWORD, 1_700_000_000_000)?.nonce).toBe(session.nonce)

    const flipped = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    expect(verifyLeadsSession(flipped, PASSWORD, 1_700_000_000_000)).toBeNull()
    expect(verifyLeadsSession(token, 'rotated-leads-password-value', 1_700_000_000_000)).toBeNull()
    expect(verifyLeadsSession(token, PASSWORD, 1_700_000_000_000 + LEADS_SESSION_TTL_SECONDS * 1000)).toBeNull()
    expect(verifyLeadsSession(`${token}.extra`, PASSWORD)).toBeNull()
    expect(verifyLeadsSession('', PASSWORD)).toBeNull()
  })
})

describe('leads login', () => {
  it('sets a 7 day cookie only for the right password', async () => {
    const response = await login(loginRequest(PASSWORD))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}`)
    expect(response.headers.get('location')).not.toContain(PASSWORD)
    const cookie = response.headers.getSetCookie().join(';')
    expect(cookie).toContain(`${LEADS_SESSION_COOKIE}=`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('secure')
    expect(cookie.toLowerCase()).toContain('samesite=strict')
    expect(cookie.toLowerCase()).toContain(`max-age=${LEADS_SESSION_TTL_SECONDS}`)
    expect(cookie.toLowerCase()).toContain('path=/admin/leads')
    expect(cookie).not.toContain(PASSWORD)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(verifyLeadsSession(cookieValue(response), PASSWORD)).not.toBeNull()
  })

  it('uses one generic error for a wrong password and does not set a cookie', async () => {
    const response = await login(loginRequest('wrong-leads-password', '203.0.113.21'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}?e=${LEADS_LOGIN_ERROR}`)
    expect(response.headers.get('location')).not.toContain('wrong-leads-password')
    expect(response.headers.getSetCookie().join(';')).not.toContain(`${LEADS_SESSION_COOKIE}=`)
    const rows = await getDb().$client.execute('SELECT COUNT(*) AS n FROM rate_limits')
    expect(Number(rows.rows[0]?.n)).toBe(1)
  })

  it('rate limits failed attempts per IP and still allows another IP', async () => {
    const ip = '203.0.113.22'
    for (let attempt = 0; attempt < LEADS_LOGIN_LIMIT; attempt += 1) {
      const response = await login(loginRequest('wrong-leads-password', ip))
      expect(response.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}?e=${LEADS_LOGIN_ERROR}`)
    }
    const blocked = await login(loginRequest(PASSWORD, ip))
    expect(blocked.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}?e=${LEADS_LIMIT_ERROR}`)
    expect(blocked.headers.getSetCookie().join(';')).not.toContain(`${LEADS_SESSION_COOKIE}=`)

    const other = await login(loginRequest(PASSWORD, '203.0.113.23'))
    expect(other.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}`)
    expect(cookieValue(other)).not.toBe('')
  })

  it('fails closed when the password is unset and when the limiter cannot be read', async () => {
    delete process.env.BBF_LEADS_PASSWORD
    const missing = await login(loginRequest(PASSWORD, '203.0.113.24'))
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('Not found.')
    expect(missing.headers.getSetCookie().join(';')).not.toContain(LEADS_SESSION_COOKIE)

    process.env.BBF_LEADS_PASSWORD = '   '
    const blank = await login(loginRequest(PASSWORD, '203.0.113.25'))
    expect(blank.status).toBe(404)

    process.env.BBF_LEADS_PASSWORD = PASSWORD
    await getDb().$client.execute('DROP TABLE rate_limits')
    const broken = await login(loginRequest(PASSWORD, '203.0.113.26'))
    expect(broken.status).toBe(503)
    expect(broken.headers.getSetCookie().join(';')).not.toContain(`${LEADS_SESSION_COOKIE}=`)
    expect(await broken.text()).not.toContain(PASSWORD)
  })

  it('refuses a missing trusted IP on Vercel without writing a shared bucket', async () => {
    process.env.VERCEL = '1'
    process.env.VERCEL_ENV = 'production'
    const response = await login(
      new Request('https://dash.example/admin/leads/login', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '203.0.113.27',
        },
        body: new URLSearchParams({ password: PASSWORD }),
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`https://dash.example${LEADS_HOME}?e=${LEADS_LOGIN_ERROR}`)
    expect(response.headers.getSetCookie().join(';')).not.toContain(`${LEADS_SESSION_COOKIE}=`)
    const rows = await getDb().$client.execute('SELECT COUNT(*) AS n FROM rate_limits')
    expect(Number(rows.rows[0]?.n)).toBe(0)
  })
})

describe('leads logout and import auth', () => {
  it('clears the cookie on logout and rejects a tampered cookie', async () => {
    const signed = await login(loginRequest(PASSWORD, '203.0.113.28'))
    const token = cookieValue(signed)
    const session = verifyLeadsSession(token, PASSWORD)
    expect(session).not.toBeNull()

    const loggedOut = await logout(
      new Request('https://dash.example/admin/leads/logout', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `${LEADS_SESSION_COOKIE}=${token}`,
        },
        body: new URLSearchParams({ csrf: session?.nonce ?? '' }),
      }),
    )
    expect(loggedOut.status).toBe(303)
    expect(loggedOut.headers.getSetCookie().join(';').toLowerCase()).toContain('max-age=0')

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    const rejected = await importLeads(
      new Request('https://dash.example/admin/leads/import', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          'content-type': 'application/json',
          cookie: `${LEADS_SESSION_COOKIE}=${tampered}`,
        },
        body: '[]',
      }),
    )
    expect(rejected.status).toBe(401)
    expect(await rejected.text()).not.toContain(PASSWORD)

    process.env.BBF_LEADS_PASSWORD = 'rotated-leads-password-value'
    const rotated = await importLeads(
      new Request('https://dash.example/admin/leads/import', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          'content-type': 'application/json',
          cookie: `${LEADS_SESSION_COOKIE}=${token}`,
        },
        body: '[]',
      }),
    )
    expect(rotated.status).toBe(401)
  })
})
