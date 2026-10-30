import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { CATALOG_REJECT_MESSAGE, CATALOG_REJECT_PATH, isUnsafeCatalogPath, requestPath } from '@/lib/catalog-path'
import { hasDotSegment } from '@/lib/dot-segment'
import { buildContentSecurityPolicy, securityHeaders } from '@/lib/csp'
import { getDb, peekCachedTaskSlugs } from '@/lib/db/client'
import { isAdminPath } from '@/lib/admin-path'
import { LOGIN_CSRF_COOKIE, LOGIN_CSRF_HEADER, loginCsrfCookie } from '@/lib/signups/auth/login-csrf'
import { signupsAuthConfigured } from '@/lib/signups/auth/config'
import { decideSignupsGate } from '@/lib/signups/gate'
import { isSignupsAdminPath, SIGNUPS_LOGIN, SIGNUPS_REQUEST_HEADER } from '@/lib/signups/paths'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'
import { isJunkPath } from '@/lib/junk-path'
import { isStaticAssetPath, publicAssetFile } from '@/lib/public-asset'
import { adminSponsorsEnabled, isAdminMfaPath, isClerkConfigured, isRatingsPath, isSponsorsAdminPath, userRatingsEnabled } from '@/lib/flags'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from '@/lib/indexing'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { hasMalformedPercentEncoding, MALFORMED_PERCENT_MESSAGE } from '@/lib/percent-encoding'
import { consumeResultRateLimit, scheduleResultWindowPurge } from '@/lib/rate-limit'
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

function nextWithNonce(request: NextRequest, csrf?: string): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production')
  const requestHeaders = new Headers(request.headers)
  // Drop a client-supplied copy. Only this proxy sets the signups marker.
  requestHeaders.delete(SIGNUPS_REQUEST_HEADER)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-bbf-method', request.method)
  requestHeaders.set('Content-Security-Policy', csp)
  if (isSignupsAdminPath(request.nextUrl.pathname)) requestHeaders.set(SIGNUPS_REQUEST_HEADER, '1')
  if (csrf) requestHeaders.set(LOGIN_CSRF_HEADER, csrf)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.delete(SIGNUPS_REQUEST_HEADER)
  if (csrf) response.cookies.set(LOGIN_CSRF_COOKIE, csrf, loginCsrfCookie)
  return adminHeaders(applySecurity(response, nonce), request.nextUrl.pathname)
}

/** Admin responses stay out of caches and search, including production. */
function adminHeaders(response: NextResponse, pathname: string): NextResponse {
  if (!isAdminPath(pathname)) return response
  response.headers.set('cache-control', 'no-store')
  response.headers.set('x-robots-tag', 'noindex, nofollow')
  return response
}

function isMembersPath(pathname: string): boolean {
  return pathname === '/members' || pathname.startsWith('/members/')
}

const RATINGS_HIDDEN_MESSAGE = 'Not found.'

/**
 * Next decodes `/:path*` header params before this function runs. A truncated
 * escape throws there and the failed 400 render becomes a 500. Reject the raw
 * path here when the proxy does run. `scripts/serve.ts` and the `vercel.json`
 * route see the path before that decode.
 */
function rejectMalformedEncoding(request: NextRequest): NextResponse | null {
  const paths = [request.nextUrl.pathname, ...rawPaths(request)]
  if (!paths.some((value) => hasMalformedPercentEncoding(value))) return null
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  return applySecurity(
    new NextResponse(MALFORMED_PERCENT_MESSAGE, {
      status: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    }),
    nonce,
  )
}

/**
 * Ratings routes 404 here while the flag is off, before the catalog reject and
 * the members sign-in redirect. The path is decoded and lowercased first.
 * The body is plain text so it is distinct from the app not-found page.
 */
function hiddenNotFound(): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  return applySecurity(
    new NextResponse(RATINGS_HIDDEN_MESSAGE, {
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

function requestPaths(request: NextRequest): string[] {
  return [request.nextUrl.pathname, ...rawPaths(request).map((value) => requestPath(value))]
}

function rejectHiddenRatings(request: NextRequest): NextResponse | null {
  const paths = requestPaths(request)
  const ratingsPaths = paths.filter((path) => isRatingsPath(path))
  if (ratingsPaths.length === 0) return null
  if (userRatingsEnabled()) return null
  // Sponsor admins still need MFA setup when ratings are off. Any other ratings path stays hidden.
  if (ratingsPaths.every((path) => isAdminMfaPath(path)) && adminSponsorsEnabled()) return null
  return hiddenNotFound()
}

/** /admin/sponsors 404s while ADMIN_SPONSORS is off. Ratings being on does not open it. */
function rejectHiddenSponsors(request: NextRequest): NextResponse | null {
  const paths = requestPaths(request)
  if (!paths.some((path) => isSponsorsAdminPath(path))) return null
  if (adminSponsorsEnabled()) return null
  return hiddenNotFound()
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
  const pathname = request.nextUrl.pathname
  if (isMembersPath(pathname)) {
    await auth.protect()
  }
  if (isAdminPath(pathname)) {
    const { userId } = await auth()
    // Signed-out visitors 404 in the admin layout. protect() in middleware would send them to sign-in.
    if (userId) await auth.protect()
  }
  return nextWithNonce(request)
})

/** Faults run only when Playwright sets RESULT_FAULTS=1 and VERCEL_ENV is development or test. */
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
 * A read that only runs long renders the page. The shared fixed window waits
 * RESULT_SHARED_LIMIT_MS (default 1000). If it does not answer, the in-memory
 * counter decides and one JSON fallback line is logged. Expired windows are
 * deleted after the response.
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
      event.waitUntil(scheduleResultWindowPurge(db))
      return consumeResultRateLimit(db, key, ACTION_LIMITS.result.limit, ACTION_LIMITS.result.windowMs)
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

/**
 * Image URLs used to miss the matcher and render the site header, which calls
 * Clerk auth() and 500s. A real public file continues. Anything else is a 404
 * here, before that header runs.
 */
function staticAssetResponse(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  if (!isStaticAssetPath(pathname)) return null
  if (publicAssetFile(pathname)) return NextResponse.next()
  return new NextResponse('Not found.', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

/**
 * One 308 that removes every trailing slash. Admin paths, including /admin/
 * and /admin/signups//, keep noindex and no-store. Other paths stay a plain 308.
 * Signups with no admin secrets 404 instead of redirecting.
 */
function redirectTrailingSlash(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl
  if (pathname.length <= 1 || !pathname.endsWith('/')) return null
  const stripped = pathname.replace(/\/+$/, '') || '/'
  const signups = isSignupsAdminPath(pathname) || isSignupsAdminPath(stripped)
  if (signups && !signupsAuthConfigured()) return hiddenNotFound()
  const target = new URL(request.url)
  target.pathname = stripped
  const admin = isAdminPath(pathname) || isAdminPath(stripped)
  if (!admin) return NextResponse.redirect(target, 308)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const response = NextResponse.redirect(target, 308)
  applyPrivacyHeaders(response.headers)
  return adminHeaders(applySecurity(response, nonce), pathname)
}

/** Scanner probes get a cacheable bare 404 before any other work. */
function rejectJunkPath(request: NextRequest): NextResponse | null {
  if (!isJunkPath(request.nextUrl.pathname)) return null
  return new NextResponse('Not found.', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const asset = staticAssetResponse(request)
  if (asset) return asset
  const slashed = redirectTrailingSlash(request)
  if (slashed) return slashed
  const junk = rejectJunkPath(request)
  if (junk) return junk
  const malformed = rejectMalformedEncoding(request)
  if (malformed) return malformed
  const hiddenRatings = rejectHiddenRatings(request)
  if (hiddenRatings) return hiddenRatings
  const hiddenSponsors = rejectHiddenSponsors(request)
  if (hiddenSponsors) return hiddenSponsors
  const rejected = rejectCatalogPath(request)
  if (rejected) return rejected
  const signups = await decideSignupsGate(request)
  if (signups.action === 'not-found') return hiddenNotFound()
  if (signups.action === 'redirect') {
    const url = request.nextUrl.clone()
    url.pathname = SIGNUPS_LOGIN
    url.search = ''
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
    return adminHeaders(applySecurity(NextResponse.redirect(url), nonce), request.nextUrl.pathname)
  }
  if (signups.action === 'next') return nextWithNonce(request, signups.csrf ?? undefined)
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
  matcher: ['/((?!_next/static|_next/image).*)'],
}
