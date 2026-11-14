import { NextResponse } from 'next/server'
import { requireLeadsSession } from '@/lib/leads/access'
import { LEADS_SESSION_COOKIE, leadsSessionCookie } from '@/lib/leads/auth/session'
import { LEADS_HOME } from '@/lib/leads/paths'
import { safeEqual } from '@/lib/signups/auth/safe-equal'
import { isSameOrigin } from '@/lib/signups/auth/origin'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

export async function POST(request: Request) {
  const access = await requireLeadsSession(request)
  if (!access.configured) return notFoundResponse()

  const response = NextResponse.redirect(new URL(LEADS_HOME, request.url), 303)
  applyPrivacyHeaders(response.headers)
  if (!isSameOrigin(request)) return response

  let csrf: string
  try {
    const form = await request.formData()
    const raw = form.get('csrf')
    csrf = typeof raw === 'string' ? raw : ''
  } catch {
    csrf = ''
  }
  if (access.session && !safeEqual(access.session.nonce, csrf)) return response

  response.cookies.set(LEADS_SESSION_COOKIE, '', { ...leadsSessionCookie, maxAge: 0 })
  return response
}
