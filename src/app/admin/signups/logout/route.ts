import { NextResponse } from 'next/server'
import { requireSignupsSession } from '@/lib/signups/access'
import { isSameOrigin } from '@/lib/signups/auth/origin'
import { safeEqual } from '@/lib/signups/auth/safe-equal'
import { SESSION_COOKIE, sessionCookieBase } from '@/lib/signups/auth/session'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'
import { SIGNUPS_HOME, SIGNUPS_LOGIN } from '@/lib/signups/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

export async function POST(request: Request) {
  const access = await requireSignupsSession(request)
  if (!access.configured) return notFoundResponse()

  const home = NextResponse.redirect(new URL(SIGNUPS_HOME, request.url), 303)
  applyPrivacyHeaders(home.headers)
  if (!isSameOrigin(request)) return home

  const form = await request.formData()
  const csrf = String(form.get('csrf') ?? '')
  if (!access.session || !safeEqual(access.session.nonce, csrf)) return home

  const response = NextResponse.redirect(new URL(SIGNUPS_LOGIN, request.url), 303)
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieBase, maxAge: 0 })
  applyPrivacyHeaders(response.headers)
  return response
}
