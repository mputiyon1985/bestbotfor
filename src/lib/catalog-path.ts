import { slugSchema } from './validation'

const CATALOG_ROOT = /^\/(go|best|tools)(\/.*)?$/

/**
 * True when a raw request path is under /go, /best, or /tools but is not one
 * safe slug. This runs on the path before the URL parser collapses `%2e%2e`
 * into `/`, which would otherwise answer with the home page.
 */
export function isUnsafeCatalogPath(rawUrl: string): boolean {
  const path = (rawUrl.split('?')[0] ?? rawUrl).split('#')[0] ?? rawUrl
  const match = CATALOG_ROOT.exec(path)
  if (!match) return false
  const rest = match[2] ?? ''
  // The tools directory is a real page. Job and redirect routes still require one slug.
  if (match[1] === 'tools' && (rest === '' || rest === '/')) return false
  const segment = /^\/([^/]+)\/?$/.exec(rest)
  if (!segment?.[1]) return true
  let decoded = segment[1]
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
