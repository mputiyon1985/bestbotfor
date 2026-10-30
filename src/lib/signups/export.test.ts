import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/admin/signups/export/route'
import { hashPassword } from '@/lib/signups/auth/password'
import { createSessionToken, SESSION_COOKIE } from '@/lib/signups/auth/session'
import { base32Encode } from '@/lib/signups/auth/totp'

const SECRET = 'test-session-secret-value'

const KEYS = ['SIGNUPS_SESSION_SECRET', 'SIGNUPS_ADMIN_PASSWORD_HASH', 'SIGNUPS_TOTP_SECRET', 'SIGNUPS_TURSO_DATABASE_URL', 'SIGNUPS_TURSO_AUTH_TOKEN', 'BEEHIIV_API_KEY', 'BEEHIIV_PUBLICATION_ID', 'CLERK_SECRET_KEY'] as const
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

function configure() {
  process.env.SIGNUPS_SESSION_SECRET = SECRET
  process.env.SIGNUPS_ADMIN_PASSWORD_HASH = hashPassword('test-password-value')
  process.env.SIGNUPS_TOTP_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
}

beforeEach(() => {
  configure()
  delete process.env.SIGNUPS_TURSO_DATABASE_URL
  delete process.env.SIGNUPS_TURSO_AUTH_TOKEN
  delete process.env.BEEHIIV_API_KEY
  delete process.env.BEEHIIV_PUBLICATION_ID
  delete process.env.CLERK_SECRET_KEY
})

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('csv export', () => {
  it('401s without a session and does not return a spreadsheet', async () => {
    const response = await GET(new Request('https://dash.example/admin/signups/export'))
    expect(response.status).toBe(401)
    const body = await response.text()
    expect(body).toBe('Unauthorized')
    expect(body).not.toContain('source,email')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('404s when the admin secrets are unset', async () => {
    delete process.env.SIGNUPS_SESSION_SECRET
    const response = await GET(new Request('https://dash.example/admin/signups/export'))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found.')
  })

  it('returns csv for a valid session even when every source is unavailable', async () => {
    const { token } = await createSessionToken(SECRET)
    const response = await GET(
      new Request('https://dash.example/admin/signups/export', { headers: { cookie: `${SESSION_COOKIE}=${token}` } }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(await response.text()).toBe('source,email,created_at\r\n')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
