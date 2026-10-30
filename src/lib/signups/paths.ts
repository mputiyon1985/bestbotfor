/**
 * Canonical signups admin paths. The public site does not link to these.
 * Decode once, then lowercase, so /Admin/Signups gets the same gate.
 * A bad percent-encoding is left as written.
 */
export function normalizeSignupsPath(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A bad percent-encoding stays as written. The match still runs.
  }
  if (decoded.length > 1 && decoded.endsWith('/')) decoded = decoded.slice(0, -1)
  return decoded.toLowerCase()
}

export const SIGNUPS_HOME = '/admin/signups'
export const SIGNUPS_LOGIN = '/admin/signups/login'
export const SIGNUPS_LOGOUT = '/admin/signups/logout'
export const SIGNUPS_EXPORT = '/admin/signups/export'

/** Set by the proxy on the forwarded request. A client-supplied value is stripped first. */
export const SIGNUPS_REQUEST_HEADER = 'x-bbf-signups'

export function isSignupsAdminPath(pathname: string): boolean {
  const path = normalizeSignupsPath(pathname)
  return path === SIGNUPS_HOME || path.startsWith(`${SIGNUPS_HOME}/`)
}

export function isSignupsLoginPath(pathname: string): boolean {
  const path = normalizeSignupsPath(pathname)
  return path === SIGNUPS_LOGIN || path.startsWith(`${SIGNUPS_LOGIN}/`)
}
