import { isAdminPath } from './admin-path'

/**
 * Next answers a repeated slash (`/admin/signups//`) with its own 308 before
 * the proxy runs, and that response has no noindex or no-store header.
 * Collapse those admin paths here. A public path returns null so Next keeps
 * its own redirect.
 */
export function adminCollapsedRedirect(rawUrl: string): string | null {
  const hash = rawUrl.indexOf('#')
  const withoutHash = hash === -1 ? rawUrl : rawUrl.slice(0, hash)
  const query = withoutHash.indexOf('?')
  const path = query === -1 ? withoutHash : withoutHash.slice(0, query)
  const search = query === -1 ? '' : withoutHash.slice(query)
  if (!path.startsWith('/')) return null
  const collapsed = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  const stripped = collapsed.length > 1 ? collapsed.replace(/\/+$/, '') || '/' : collapsed
  if (stripped === path) return null
  if (!isAdminPath(path) && !isAdminPath(stripped)) return null
  return `${stripped}${search}`
}
