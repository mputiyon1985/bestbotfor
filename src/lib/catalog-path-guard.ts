import type { IncomingMessage, ServerResponse } from 'node:http'
import { Server } from 'node:http'
import { CATALOG_REJECT_MESSAGE, isUnsafeCatalogPath } from './catalog-path'
import { installCatalogUrlGuard } from './catalog-url-guard'

const INSTALLED = Symbol.for('bestbotfor.catalog-path-guard')

/**
 * Next's request URL collapses `/go/%2e%2e` to `/` before the proxy runs.
 * The Node request still has the raw path, so reject it here. The URL guard
 * covers hosts that call the Next handler without `http.Server`.
 */
export function installCatalogPathGuard(): void {
  const state = globalThis as typeof globalThis & { [INSTALLED]?: boolean }
  if (state[INSTALLED]) return
  state[INSTALLED] = true

  installCatalogUrlGuard()

  const original = Server.prototype.emit
  Server.prototype.emit = function (event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'request') {
      const req = args[0] as IncomingMessage | undefined
      const res = args[1] as ServerResponse | undefined
      if (req && res && isUnsafeCatalogPath(req.url ?? '')) {
        res.statusCode = 404
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.setHeader('x-robots-tag', 'noindex, nofollow')
        res.end(CATALOG_REJECT_MESSAGE)
        return true
      }
    }
    return original.apply(this, [event, ...args])
  }
}
