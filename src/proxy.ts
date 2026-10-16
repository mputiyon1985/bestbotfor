import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { CATALOG_REJECT_MESSAGE, CATALOG_REJECT_PATH, isUnsafeCatalogPath } from '@/lib/catalog-path'
import { buildContentSecurityPolicy, securityHeaders } from '@/lib/csp'
import { isClerkConfigured } from '@/lib/flags'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from '@/lib/indexing'

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

function catalogCandidate(request: NextRequest): boolean {
  if (request.nextUrl.pathname === CATALOG_REJECT_PATH) return true
  if (isUnsafeCatalogPath(request.url) || isUnsafeCatalogPath(request.nextUrl.pathname)) return true
  for (const name of ['x-matched-path', 'x-invoke-path', 'next-url']) {
    const value = request.headers.get(name)
    if (value && isUnsafeCatalogPath(value)) return true
  }
  return false
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

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const rejected = rejectCatalogPath(request)
  if (rejected) return rejected
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
