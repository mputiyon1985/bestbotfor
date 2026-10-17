/**
 * True for /admin and everything under it. Safe for the proxy and client code.
 * Decode once, then lowercase, so /Admin and /ADMIN/... get the same headers.
 * A bad percent-encoding is left as written.
 */
export function isAdminPath(pathname: string): boolean {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A bad percent-encoding stays as written. The match still runs.
  }
  if (decoded.length > 1 && decoded.endsWith('/')) decoded = decoded.slice(0, -1)
  const path = decoded.toLowerCase()
  return path === '/admin' || path.startsWith('/admin/')
}
