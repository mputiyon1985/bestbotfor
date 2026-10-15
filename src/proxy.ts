import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy, securityHeaders } from '@/lib/csp'
import { isClerkConfigured } from '@/lib/flags'

function applySecurity(response: NextResponse, nonce: string): NextResponse {
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production')
  response.headers.set('Content-Security-Policy', csp)
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

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isMembersPath(request.nextUrl.pathname)) {
    await auth.protect()
  }
  return nextWithNonce(request)
})

export function proxy(request: NextRequest, event: NextFetchEvent) {
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
