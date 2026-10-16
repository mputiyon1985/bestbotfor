import { CATALOG_REJECT_PATH, isUnsafeCatalogPath } from './catalog-path'

const INSTALLED = Symbol.for('bestbotfor.catalog-url-guard')

/**
 * `new URL('/go/%2e%2e', base)` collapses the path to `/` before Proxy or the
 * route sees it. Rewrite that input to a dedicated 404 path first. Normal
 * slugs are left alone.
 */
function rejectTarget(raw: string): string {
  if (raw.startsWith('/')) return CATALOG_REJECT_PATH
  const match = /^([a-zA-Z][a-zA-Z\d+.-]*:\/\/[^/?#]*)/.exec(raw)
  if (match) return `${match[1]}${CATALOG_REJECT_PATH}`
  return CATALOG_REJECT_PATH
}

export function installCatalogUrlGuard(): void {
  const state = globalThis as typeof globalThis & { [INSTALLED]?: boolean }
  if (state[INSTALLED]) return
  state[INSTALLED] = true

  const Original = globalThis.URL

  function GuardedURL(input: string | URL, base?: string | URL): URL {
    const raw = typeof input === 'string' ? input : input.href
    const next = isUnsafeCatalogPath(raw) ? rejectTarget(raw) : input
    if (base === undefined) return new Original(next)
    return new Original(next, base)
  }

  GuardedURL.prototype = Original.prototype
  Object.setPrototypeOf(GuardedURL, Original)

  const parse = Original.parse?.bind(Original)
  if (parse) {
    Object.defineProperty(GuardedURL, 'parse', {
      configurable: true,
      writable: true,
      value(url: string | URL, base?: string | URL) {
        const raw = typeof url === 'string' ? url : url.href
        const next = isUnsafeCatalogPath(raw) ? rejectTarget(raw) : url
        return parse(next, base)
      },
    })
  }

  globalThis.URL = GuardedURL as unknown as typeof URL
}
