import { NextResponse } from 'next/server'
import { requireSignupsSession } from '@/lib/signups/access'
import { clientKey, readCookie } from '@/lib/signups/auth/cookies'
import { LOGIN_CSRF_COOKIE, loginCsrfCookie } from '@/lib/signups/auth/login-csrf'
import { isSameOrigin } from '@/lib/signups/auth/origin'
import { verifyPassword } from '@/lib/signups/auth/password'
import { clearFailures, isRateLimited, recordFailure, waitForFailureDelay } from '@/lib/signups/auth/rate-limit'
import { safeEqual } from '@/lib/signups/auth/safe-equal'
import { signupsPasswordHash, signupsSessionSecret, signupsTotpSecret } from '@/lib/signups/auth/config'
import { createSessionToken, MIN_SESSION_SECRET_LENGTH, SESSION_COOKIE, sessionCookieBase } from '@/lib/signups/auth/session'
import { verifyTotp } from '@/lib/signups/auth/totp'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'
import { SIGNUPS_HOME, SIGNUPS_LOGIN } from '@/lib/signups/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

function failureRedirect(request: Request): NextResponse {
  const response = NextResponse.redirect(new URL(`${SIGNUPS_LOGIN}?e=1`, request.url), 303)
  applyPrivacyHeaders(response.headers)
  return response
}

export async function POST(request: Request) {
  const access = await requireSignupsSession(request)
  if (!access.configured) return notFoundResponse()

  const fail = async () => {
    await waitForFailureDelay()
    return failureRedirect(request)
  }

  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > 10_000) return fail()
  if (!isSameOrigin(request)) return fail()

  const form = await request.formData()
  const csrf = String(form.get('csrf') ?? '')
  const password = String(form.get('password') ?? '')
  const code = String(form.get('code') ?? '')
  const csrfCookie = readCookie(request, LOGIN_CSRF_COOKIE)
  if (!csrfCookie || !csrf || !safeEqual(csrfCookie, csrf)) return fail()

  const key = clientKey(request)
  if (isRateLimited(key)) return fail()

  const passwordHash = signupsPasswordHash()
  const totpSecret = signupsTotpSecret()
  const sessionSecret = signupsSessionSecret()
  if (!passwordHash || !totpSecret || sessionSecret.length < MIN_SESSION_SECRET_LENGTH || password.length === 0 || password.length > 256) {
    recordFailure(key)
    return fail()
  }

  const passwordOk = verifyPassword(password, passwordHash)
  const totpOk = verifyTotp(code, totpSecret)
  if (!passwordOk || !totpOk) {
    recordFailure(key)
    return fail()
  }

  clearFailures(key)
  const { token } = await createSessionToken(sessionSecret)
  const response = NextResponse.redirect(new URL(SIGNUPS_HOME, request.url), 303)
  response.cookies.set(SESSION_COOKIE, token, sessionCookieBase)
  response.cookies.set(LOGIN_CSRF_COOKIE, '', { ...loginCsrfCookie, maxAge: 0 })
  applyPrivacyHeaders(response.headers)
  return response
}
