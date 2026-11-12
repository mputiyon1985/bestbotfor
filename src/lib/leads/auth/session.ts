import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { LEADS_HOME } from '../paths'

export const LEADS_SESSION_COOKIE = 'bbf_leads_session'
/** Twelve hours. A copied cookie dies with this lifetime. Rotating BBF_LEADS_SESSION_SECRET kills them immediately. */
export const LEADS_SESSION_TTL_SECONDS = 12 * 60 * 60

export type LeadsSession = {
  v: 1
  exp: number
  nonce: string
}

/** Scoped to the leads admin path so the cookie is not sent on public pages. */
export const leadsSessionCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: LEADS_HOME,
  maxAge: LEADS_SESSION_TTL_SECONDS,
}

function signature(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

export function createLeadsSessionToken(secret: string, now = Date.now()): { token: string; session: LeadsSession } {
  const session: LeadsSession = {
    v: 1,
    exp: Math.floor(now / 1000) + LEADS_SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(session)).toString('base64url')
  const token = `${body}.${signature(secret, body).toString('base64url')}`
  return { token, session }
}

export function verifyLeadsSession(token: string, secret: string, now = Date.now()): LeadsSession | null {
  if (!secret || secret.length < 32) return null
  if (!token || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, presented] = parts
  if (!body || !presented) return null

  const expected = signature(secret, body)
  const actual = Buffer.from(presented, 'base64url')
  if (actual.length !== expected.length) {
    timingSafeEqual(expected, expected)
    return null
  }
  if (!timingSafeEqual(actual, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as Partial<LeadsSession>
  if (payload.v !== 1) return null
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null
  if (payload.exp * 1000 <= now) return null
  if (typeof payload.nonce !== 'string' || payload.nonce.length < 16) return null
  return { v: 1, exp: payload.exp, nonce: payload.nonce }
}
