import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { CATALOG_REJECT_MESSAGE, CATALOG_REJECT_PATH, isUnsafeCatalogPath } from '@/lib/catalog-path'
import { hasDotSegment } from '@/lib/dot-segment'
import { buildContentSecurityPolicy, securityHeaders } from '@/lib/csp'
import { withDeadline } from '@/lib/deadline'
import { getDb } from '@/lib/db/client'
import { isClerkConfigured } from '@/lib/flags'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from '@/lib/indexing'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { resultNotFoundHeaders, resultNotFoundHtml, resultRateLimitHeaders, resultRateLimitHtml } from '@/lib/result-http'
import { resultRequestStatus } from '@/lib/result-request'

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

/**
 * /result 404s are answered here so the page's not-found screen does not add a
 * second robots meta. Quiz views that pass the catalog check are rate limited
 * with 429 and Retry-After. A database failure fails open.
 */
async function gateResult(request: NextRequest): Promise<NextResponse | null> {
  if (request.nextUrl.pathname !== '/result') return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  try {
    const status = await withDeadline(resultRequestStatus(getDb(), request.nextUrl.searchParams), 800)
    if (status === 'not-found') {
      return applySecurity(new NextResponse(resultNotFoundHtml(), { status: 404, headers: resultNotFoundHeaders() }), nonce)
    }
  } catch (error) {
    console.error('result lookup failed', error instanceof Error ? error.name : 'error')
    return null
  }
  if ((request.nextUrl.searchParams.get('view') ?? '') !== '') return null
  try {
    const limited = await withDeadline(
      consumeRateLimit(
        getDb(),
        rateLimitKey(clientIp(request.headers), 'result'),
        ACTION_LIMITS.result.limit,
        ACTION_LIMITS.result.windowMs,
      ),
      800,
    )
    if (limited.ok) return null
    return applySecurity(
      new NextResponse(resultRateLimitHtml(), { status: 429, headers: resultRateLimitHeaders(limited.resetAt) }),
      nonce,
    )
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return null
  }
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const rejected = rejectCatalogPath(request)
  if (rejected) return rejected
  const gated = await gateResult(request)
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
