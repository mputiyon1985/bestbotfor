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
export const LEADS_LOGOUT = '/admin/leads/logout'
export const LEADS_IMPORT = '/admin/leads/import'

/** Set by the proxy on the forwarded request. A client-supplied value is stripped first. */
export const LEADS_REQUEST_HEADER = 'x-bbf-leads'

export const LEADS_LOGIN_ERROR = '1'
export const LEADS_LIMIT_ERROR = '2'

export function isLeadsAdminPath(pathname: string): boolean {
  const path = normalizeLeadsPath(pathname)
  return path === LEADS_HOME || path.startsWith(`${LEADS_HOME}/`)
}

/**
 * Fail closed. Unset, empty, and whitespace-only are not configured.
 * The raw value is not returned. A value longer than 256 characters is
 * treated as unset so a broken env cannot open the page.
 */
export function leadsAuthConfigured(value: string | undefined = process.env.BBF_LEADS_PASSWORD): boolean {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > 256) return false
  return value.trim().length > 0
}

export type LeadsGate = 'skip' | 'not-found' | 'next'

/** Public routes return skip so the rest of the proxy is unchanged. */
export function decideLeadsGate(pathname: string, configured = leadsAuthConfigured()): LeadsGate {
  if (!isLeadsAdminPath(pathname)) return 'skip'
  return configured ? 'next' : 'not-found'
}
