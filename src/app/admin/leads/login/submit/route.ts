import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireLeadsSession } from '@/lib/leads/access'
import { leadsPassword, leadsPasswordMatches } from '@/lib/leads/auth/password'
import { consumeLeadsAttempt, leadsAttemptKey } from '@/lib/leads/auth/rate-limit'
import { createLeadsSessionToken, LEADS_SESSION_COOKIE, leadsSessionCookie } from '@/lib/leads/auth/session'
import { LEADS_HOME, LEADS_LIMIT_ERROR, LEADS_LOGIN, LEADS_LOGIN_ERROR, leadsSessionSecret } from '@/lib/leads/paths'
import { isSameOrigin } from '@/lib/signups/auth/origin'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

function unavailable(): NextResponse {
  const response = new NextResponse('Unavailable.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

function redirectTo(request: Request, error: typeof LEADS_LOGIN_ERROR | typeof LEADS_LIMIT_ERROR | null): NextResponse {
  const target = error ? `${LEADS_LOGIN}?e=${error}` : LEADS_HOME
  const response = NextResponse.redirect(new URL(target, request.url), 303)
  applyPrivacyHeaders(response.headers)
  return response
}

async function readPassword(request: Request): Promise<string> {
  try {
    const form = await request.formData()
    const raw = form.get('password')
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  const access = await requireLeadsSession(request)
  if (!access.configured) return notFoundResponse()

  const bucket = leadsAttemptKey(request)
  if (bucket.action === 'refuse') return redirectTo(request, LEADS_LOGIN_ERROR)

  let db
  try {
    db = getDb()
  } catch {
    return unavailable()
  }

  const gate = await consumeLeadsAttempt(db, bucket.key)
  if (gate === 'unavailable') return unavailable()
  if (gate === 'limited') return redirectTo(request, LEADS_LIMIT_ERROR)

  const length = Number(request.headers.get('content-length') ?? '0')
  const tooBig = Number.isFinite(length) && length > 10_000
  const password = tooBig || !isSameOrigin(request) ? '' : await readPassword(request)
  const expected = leadsPassword()
  const secret = leadsSessionSecret()
  if (!expected || !secret || !leadsPasswordMatches(password, expected)) return redirectTo(request, LEADS_LOGIN_ERROR)

  const { token } = createLeadsSessionToken(secret)
  const response = redirectTo(request, null)
  response.cookies.set(LEADS_SESSION_COOKIE, token, leadsSessionCookie)
  return response
}
