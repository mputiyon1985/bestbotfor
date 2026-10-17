import { slugSchema } from './validation'

const CATALOG_ROOT = /^\/(go|best|tools)(\/.*)?$/

/** Path Next renders when a catalog URL would otherwise collapse to `/`. */
export const CATALOG_REJECT_PATH = '/catalog-reject'

export const CATALOG_REJECT_MESSAGE = 'That address is not a tool in the catalog.'

/**
 * Path portion of a request URL, without using the WHATWG parser. That parser
 * turns `/go/%2e%2e` into `/` and would hide the traversal this check exists
 * to catch. Absolute URLs are accepted because some hosts pass `req.url` that way.
 */
export function requestPath(rawUrl: string): string {
  const noHash = rawUrl.split('#')[0] ?? rawUrl
  const queryAt = noHash.indexOf('?')
  const withoutQuery = queryAt === -1 ? noHash : noHash.slice(0, queryAt)
  if (withoutQuery.startsWith('/')) return withoutQuery
  const scheme = withoutQuery.indexOf('://')
  if (scheme === -1) return withoutQuery
  const slash = withoutQuery.indexOf('/', scheme + 3)
  if (slash === -1) return '/'
  return withoutQuery.slice(slash)
}

/**
 * True when a raw request path is under /go, /best, or /tools but is not one
 * safe slug. /tools with no slug is the catalog index. This runs on the path
 * before the URL parser collapses `%2e%2e` into `/`, which would otherwise
 * answer with the home page.
 */
export function isUnsafeCatalogPath(rawUrl: string): boolean {
  const path = requestPath(rawUrl)
  const match = CATALOG_ROOT.exec(path)
  if (!match) return false
  const root = match[1]
  const rest = match[2] ?? ''
  // The tools directory is a real page. Job and redirect routes still require one slug.
  // /tools/<slug>/rate is the ratings route. A safe slug is not an extra catalog segment.
  if (root === 'tools' && (rest === '' || rest === '/')) return false
  const rate = root === 'tools' ? /^\/([^/]+)\/rate\/?$/.exec(rest) : null
  const segment = rate ?? /^\/([^/]+)\/?$/.exec(rest)
  if (!segment?.[1]) return true
  return unsafeSlug(segment[1])
}

function unsafeSlug(encoded: string): boolean {
  let decoded = encoded
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      return true
    }
  }
  if (decoded !== decoded.trim()) return true
  if (/[\\/\0]|\.\./.test(decoded) || decoded === '.' || decoded === '') return true
  return !slugSchema.safeParse(decoded).success
}

/** True when a single route param is a dot segment or otherwise not a catalog slug. */
export function isUnsafeCatalogSlug(slug: string): boolean {
  if (slug.includes('/') || slug.includes('?') || slug.includes('#')) return true
  return isUnsafeCatalogPath(`/go/${slug}`)
}
