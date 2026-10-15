import type { IncomingMessage, ServerResponse } from 'node:http'
import { Server } from 'node:http'
import { isUnsafeCatalogPath } from './catalog-path'

const INSTALLED = Symbol.for('bestbotfor.catalog-path-guard')

/**
 * Next's request URL collapses `/go/%2e%2e` to `/` before the proxy runs.
 * The Node request still has the raw path, so reject it here.
 */
export function installCatalogPathGuard(): void {
  const state = globalThis as typeof globalThis & { [INSTALLED]?: boolean }
  if (state[INSTALLED]) return
  state[INSTALLED] = true

  const original = Server.prototype.emit
  Server.prototype.emit = function (event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'request') {
      const req = args[0] as IncomingMessage | undefined
      const res = args[1] as ServerResponse | undefined
      if (req && res && isUnsafeCatalogPath(req.url ?? '')) {
        res.statusCode = 404
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end('That address is not a tool in the catalog.')
        return true
      }
    }
    return original.apply(this, [event, ...args])
  }
}
