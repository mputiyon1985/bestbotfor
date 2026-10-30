import { SIGNUPS_HOME } from '../paths'
import { base64UrlToBytes, bytesToBase64Url, randomBase64Url } from './base64url'
import { safeEqual } from './safe-equal'

export const SESSION_COOKIE = 'signups_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60
export const MIN_SESSION_SECRET_LENGTH = 32

export type SessionPayload = {
  v: 1
  exp: number
  nonce: string
  sid: string
}

/** Scoped to the signups admin path so the cookie is not sent on public pages. */
export const sessionCookieBase = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: SIGNUPS_HOME,
  maxAge: SESSION_MAX_AGE_SECONDS,
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToBase64Url(new Uint8Array(signature))
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<{ token: string; payload: SessionPayload }> {
  if (secret.length < MIN_SESSION_SECRET_LENGTH) throw new Error('session secret too short')
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor((now + SESSION_TTL_MS) / 1000),
    nonce: randomBase64Url(16),
    sid: randomBase64Url(16),
  }
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await hmacSha256(secret, body)
  return { token: `${body}.${signature}`, payload }
}

export async function verifySessionToken(token: string, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  if (secret.length < MIN_SESSION_SECRET_LENGTH) return null
  if (!token || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (!body || !signature) return null
  const expected = await hmacSha256(secret, body)
  if (!safeEqual(signature, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const payload = parsed as Partial<SessionPayload>
  if (payload.v !== 1) return null
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null
  if (payload.exp * 1000 <= now) return null
  if (typeof payload.nonce !== 'string' || payload.nonce.length < 8) return null
  if (typeof payload.sid !== 'string' || payload.sid.length < 8) return null
  return { v: 1, exp: payload.exp, nonce: payload.nonce, sid: payload.sid }
}
