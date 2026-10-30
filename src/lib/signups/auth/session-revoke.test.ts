import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/admin/signups/export/route'
import { POST } from '@/app/admin/signups/logout/route'
import { getDb } from '@/lib/db'
import { withSignupsAuthDb } from './fixture-db'
import { issueSignupsSession, verifyActiveSession } from './session-store'
import { SESSION_COOKIE } from './session'

const SECRET = 'test-session-secret-value-32bytes-ok'

describe('session revocation', () => {
  let closeDb: (() => Promise<void>) | undefined

  beforeEach(async () => {
    closeDb = await withSignupsAuthDb()
    process.env.SIGNUPS_SESSION_SECRET = SECRET
    process.env.SIGNUPS_ADMIN_PASSWORD_HASH = 'scrypt:16384:8:1:aaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    process.env.SIGNUPS_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
  })

  afterEach(async () => {
    await closeDb?.()
    delete process.env.SIGNUPS_SESSION_SECRET
    delete process.env.SIGNUPS_ADMIN_PASSWORD_HASH
    delete process.env.SIGNUPS_TOTP_SECRET
  })

  it('stops accepting a token after logout and after the secret changes', async () => {
    const issued = await issueSignupsSession(SECRET)
    const stored = await getDb().$client.execute({ sql: 'SELECT id FROM signups_sessions', args: [] })
    const storedId = String(stored.rows[0]?.id ?? '')
    expect(storedId).toMatch(/^[0-9a-f]{64}$/)
    expect(storedId).not.toBe(issued.payload.sid)
    expect(await verifyActiveSession(issued.token, SECRET)).not.toBeNull()

    const rotated = `${SECRET}-rotated`
    expect(await verifyActiveSession(issued.token, rotated)).toBeNull()
    expect(await verifyActiveSession(issued.token, SECRET)).not.toBeNull()

    const logout = await POST(
      new Request('https://dash.example/admin/signups/logout', {
        method: 'POST',
        headers: {
          origin: 'https://dash.example',
          host: 'dash.example',
          cookie: `${SESSION_COOKIE}=${issued.token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ csrf: issued.payload.nonce }),
      }),
    )
    expect(logout.status).toBe(303)
    expect(logout.headers.get('location')).toBe('https://dash.example/admin/signups/login')
    expect(await verifyActiveSession(issued.token, SECRET)).toBeNull()

    const csv = await GET(
      new Request('https://dash.example/admin/signups/export', {
        headers: { cookie: `${SESSION_COOKIE}=${issued.token}` },
      }),
    )
    expect(csv.status).toBe(404)
    expect(await csv.text()).toBe('Not found.')
    expect(csv.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
