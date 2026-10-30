/**
 * Production Node server. Next parses the request with `new URL()`, which
 * removes dot segments before the proxy runs. Read `req.url` first and answer
 * 404 here. This listener is only our server. It does not patch `URL` or
 * `http.Server`, so Clerk, Stripe, and libsql keep the platform parsers.
 *
 * Vercel does not run this file. The `vercel.json` routes return 404 or 400
 * there, because the platform normalizes the path before the app starts.
 * A truncated percent-escape is answered here as well: Next decodes `/:path*`
 * header params before the proxy runs, and that throw becomes a 500.
 * `npm start` sets NODE_ENV=production before this file loads.
 */
import { createServer } from 'node:http'
import next from 'next'
import { adminCollapsedRedirect } from '../src/lib/admin-slash'
import { CATALOG_REJECT_MESSAGE } from '../src/lib/catalog-path'
import { configureFileDatabase, getDb } from '../src/lib/db/client'
import { hasDotSegment } from '../src/lib/dot-segment'
import { hasMalformedPercentEncoding, MALFORMED_PERCENT_MESSAGE } from '../src/lib/percent-encoding'

const port = Number(process.env.PORT || 3000)
const hostname = process.env.HOSTNAME || '0.0.0.0'

async function main(): Promise<void> {
  const app = next({ dev: false, hostname, port })
  const handle = app.getRequestHandler()
  await app.prepare()
  const databaseUrl = process.env.TURSO_DATABASE_URL?.trim() ?? ''
  if (databaseUrl.startsWith('file:')) await configureFileDatabase(getDb().$client)

  const server = createServer((req, res) => {
    if (hasDotSegment(req.url ?? '')) {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-robots-tag', 'noindex, nofollow')
      res.end(CATALOG_REJECT_MESSAGE)
      return
    }
    if (hasMalformedPercentEncoding(req.url ?? '')) {
      res.statusCode = 400
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-robots-tag', 'noindex, nofollow')
      res.end(MALFORMED_PERCENT_MESSAGE)
      return
    }
    // Next's own repeated-slash 308 runs before the proxy and cannot set these.
    // The body is fixed. The location is a rebuilt /admin path, not the raw URL.
    const collapsed = adminCollapsedRedirect(req.url ?? '')
    if (collapsed) {
      res.statusCode = 308
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.setHeader('location', collapsed)
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-robots-tag', 'noindex, nofollow')
      res.end('Redirecting.')
      return
    }
    handle(req, res).catch((error: unknown) => {
      console.error('request failed', error instanceof Error ? error.name : 'error')
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })

  server.listen(port, hostname, () => {
    console.log(`ready on http://${hostname}:${port}`)
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'server failed')
  process.exit(1)
})
