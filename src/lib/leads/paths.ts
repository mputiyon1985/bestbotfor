import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Canonical leads admin paths. The public site does not link to these.
 * Decode once, then lowercase, so /Admin/Leads gets the same gate.
 * A bad percent-encoding is left as written.
 */
export function normalizeLeadsPath(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A bad percent-encoding stays as written. The match still runs.
  }
  if (decoded.length > 1 && decoded.endsWith('/')) decoded = decoded.slice(0, -1)
  return decoded.toLowerCase()
}

export const LEADS_HOME = '/admin/leads'
export const LEADS_LOGIN = '/admin/leads/login'
export const LEADS_LOGIN_SUBMIT = '/admin/leads/login/submit'
export const LEADS_LOGOUT = '/admin/leads/logout'
export const LEADS_IMPORT = '/admin/leads/import'

/**
 * Set by the proxy on the forwarded request. A client-supplied value is stripped first.
 * The value is an HMAC of the path under BBF_LEADS_SESSION_SECRET, not the literal "1".
 */
export const LEADS_REQUEST_HEADER = 'x-bbf-leads'
/** Normalized path the proxy saw. Stripped if the client sent it. */
export const LEADS_PATH_HEADER = 'x-bbf-leads-path'

export const LEADS_LOGIN_ERROR = '1'
export const LEADS_LIMIT_ERROR = '2'
export const MIN_LEADS_SESSION_SECRET = 32

export function isLeadsAdminPath(pathname: string): boolean {
  const path = normalizeLeadsPath(pathname)
  return path === LEADS_HOME || path.startsWith(`${LEADS_HOME}/`)
}

export function isLeadsLoginPath(pathname: string): boolean {
  const path = normalizeLeadsPath(pathname)
  return path === LEADS_LOGIN || path.startsWith(`${LEADS_LOGIN}/`)
}

function passwordConfigured(value: string | undefined): boolean {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > 256) return false
  return value.trim().length > 0
}

/** Random session HMAC secret. Unset or shorter than 32 characters fails closed. */
export function leadsSessionSecret(value: string | undefined = process.env.BBF_LEADS_SESSION_SECRET): string | null {
  if (typeof value !== 'string') return null
  if (value.length < MIN_LEADS_SESSION_SECRET) return null
  if (value.trim().length === 0) return null
  return value
}

/**
 * Fail closed unless both the password and the session secret are set.
 * The raw values are not returned.
 */
export function leadsAuthConfigured(
  password: string | undefined = process.env.BBF_LEADS_PASSWORD,
  secret: string | undefined = process.env.BBF_LEADS_SESSION_SECRET,
): boolean {
  return passwordConfigured(password) && leadsSessionSecret(secret) !== null
}

export type LeadsGate = 'skip' | 'not-found' | 'next'

/** Public routes return skip so the rest of the proxy is unchanged. */
export function decideLeadsGate(pathname: string, configured = leadsAuthConfigured()): LeadsGate {
  if (!isLeadsAdminPath(pathname)) return 'skip'
  return configured ? 'next' : 'not-found'
}

/** HMAC of the path. A client who sends "1" cannot mint this. */
export function leadsRequestProof(pathname: string, secret: string): string {
  return createHmac('sha256', secret).update(`bestbotfor-leads-gate|v1|${normalizeLeadsPath(pathname)}`).digest('hex')
}

/** True only when the proof is the HMAC of this path under the session secret. */
export function leadsRequestAuthorized(pathname: string, proof: string | null, secret: string | null = leadsSessionSecret()): boolean {
  if (!secret || !proof || !isLeadsAdminPath(pathname)) return false
  const expected = Buffer.from(leadsRequestProof(pathname, secret))
  const actual = Buffer.from(proof)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
