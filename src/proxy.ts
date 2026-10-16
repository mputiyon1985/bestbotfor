import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { CATALOG_REJECT_MESSAGE, CATALOG_REJECT_PATH, isUnsafeCatalogPath } from '@/lib/catalog-path'
import { hasDotSegment } from '@/lib/dot-segment'
import { buildContentSecurityPolicy, securityHeaders } from '@/lib/csp'
import { getDb, peekCachedTaskSlugs } from '@/lib/db/client'
import { isClerkConfigured } from '@/lib/flags'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from '@/lib/indexing'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { consumeLocalRateLimit, persistResultRateLimit } from '@/lib/rate-limit'
import { acceptResultFault, faultedResultWork } from '@/lib/result-fault'
import { decideResultGate } from '@/lib/result-gate'
import { resultNotFoundHeaders, resultNotFoundHtml, resultRateLimitHeaders, resultRateLimitHtml, resultUnavailableHeaders, resultUnavailableHtml } from '@/lib/result-http'
import { cachedQuizStatus, resultOfflineStatus, resultRequestStatus } from '@/lib/result-request'

function applySecurity(response: NextResponse, nonce: string): NextResponse {
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production')
  response.headers.set('Content-Security-Policy', csp)
  if (!isProductionDeployment()) response.headers.set('X-Robots-Tag', PREVIEW_ROBOTS_TAG)
  for (const [key, value] of Object.entries(securityHeaders())) {
    response.headers.set(key, value)
  }
  return response
}

function nextWithNonce(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  return applySecurity(response, nonce)
}

function isMembersPath(pathname: string): boolean {
  return pathname === '/members' || pathname.startsWith('/members/')
}

function rawPaths(request: NextRequest): string[] {
  const values = [request.url, `${request.nextUrl.pathname}${request.nextUrl.search}`]
  for (const name of ['x-matched-path', 'x-invoke-path', 'next-url']) {
    const value = request.headers.get(name)
    if (value) values.push(value)
  }
  return values
}

/**
 * Dot segments are rejected on every path, not only the catalog. Encoded
 * forms collapse to `/` inside `new URL()` and on Vercel's edge, so this
 * check only helps when the host still passes the raw path. The `vercel.json`
 * route covers that edge. `scripts/serve.ts` covers local `next` parsing.
 */
function catalogCandidate(request: NextRequest): boolean {
  if (request.nextUrl.pathname === CATALOG_REJECT_PATH) return true
  return rawPaths(request).some((value) => hasDotSegment(value) || isUnsafeCatalogPath(value))
}

function rejectCatalogPath(request: NextRequest): NextResponse | null {
  if (!catalogCandidate(request)) return null
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  return applySecurity(
    new NextResponse(CATALOG_REJECT_MESSAGE, {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    }),
    nonce,
  )
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isMembersPath(request.nextUrl.pathname)) {
    await auth.protect()
  }
  return nextWithNonce(request)
})

/** Faults run only when Playwright sets RESULT_FAULTS=1 on an explicit test env. */
function resultFault(request: NextRequest) {
  return acceptResultFault(request.headers.get('x-bbf-result-fault'), {
    faults: process.env.RESULT_FAULTS,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  })
}

/**
 * /result 404s are answered here so the page's not-found screen does not add a
 * second robots meta. Invalid task and budget values do not need the catalog.
 * Quiz views that pass the catalog check are rate limited with 429 and Retry-After.
 * When the catalog lookup fails or times out, the page's catalog read runs here.
 * A cached task list skips that retry. A miss is this same 404. A thrown read is 503.
 * A read that only runs long renders the page. The shared limiter write is not
 * awaited: the in-memory counter decides, and waitUntil records the row after.
 */
async function gateResult(request: NextRequest, event: NextFetchEvent): Promise<NextResponse | null> {
  if (request.nextUrl.pathname !== '/result') return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const params = request.nextUrl.searchParams
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const offline = resultOfflineStatus(params)
  if (offline === 'not-found') {
    return applySecurity(new NextResponse(resultNotFoundHtml(), { status: 404, headers: resultNotFoundHeaders() }), nonce)
  }
  const fault = resultFault(request)
  const db = getDb()
  const readCatalog = () => resultRequestStatus(db, params)
  const cachedStatus = fault ? null : cachedQuizStatus(peekCachedTaskSlugs(db), params)
  const decision = await decideResultGate({
    view: params.get('view') ?? '',
    cachedStatus: cachedStatus ?? undefined,
    lookup: faultedResultWork(fault, 'lookup', () => (offline === 'ok' ? Promise.resolve('ok') : readCatalog())),
    pageLookup: faultedResultWork(fault, 'page', readCatalog),
    limit: faultedResultWork(fault, 'limit', () => {
      const key = rateLimitKey(clientIp(request.headers), 'result')
      const local = consumeLocalRateLimit(key, ACTION_LIMITS.result.limit, ACTION_LIMITS.result.windowMs)
      if (local.ok) event.waitUntil(persistResultRateLimit(db, key, ACTION_LIMITS.result.limit, ACTION_LIMITS.result.windowMs))
      return Promise.resolve(local)
    }),
  })
  if (decision.type === 'not-found') {
    return applySecurity(new NextResponse(resultNotFoundHtml(), { status: 404, headers: resultNotFoundHeaders() }), nonce)
  }
  if (decision.type === 'unavailable') {
    return applySecurity(new NextResponse(resultUnavailableHtml(), { status: 503, headers: resultUnavailableHeaders() }), nonce)
  }
  if (decision.type === 'limited') {
    return applySecurity(
      new NextResponse(resultRateLimitHtml(), { status: 429, headers: resultRateLimitHeaders(decision.resetAt) }),
      nonce,
    )
  }
  return null
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const rejected = rejectCatalogPath(request)
  if (rejected) return rejected
  const gated = await gateResult(request, event)
  if (gated) return gated
  if (!isClerkConfigured()) {
    if (isMembersPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/sign-in'
      url.search = ''
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
      return applySecurity(NextResponse.redirect(url), nonce)
    }
    return nextWithNonce(request)
  }
  return withClerk(request, event)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
