import type { NextRequest } from 'next/server'
import { randomBase64Url } from './auth/base64url'
import { signupsAuthConfigured, signupsSessionSecret } from './auth/config'
import { SESSION_COOKIE, verifySessionToken } from './auth/session'
import { isSignupsAdminPath, isSignupsLoginPath, normalizeSignupsPath, SIGNUPS_LOGIN } from './paths'

export type SignupsDecision =
  | { action: 'skip' }
  | { action: 'not-found' }
  | { action: 'redirect' }
  | { action: 'next'; csrf: string | null }

/**
 * Gate for /admin/signups. Public routes return skip so the rest of the proxy
 * is unchanged. Missing auth secrets are a 404, not a login form.
 * Login is the only signed-out path. Everything else needs a live session.
 */
export async function decideSignupsGate(request: NextRequest): Promise<SignupsDecision> {
  if (!isSignupsAdminPath(request.nextUrl.pathname)) return { action: 'skip' }
  if (!signupsAuthConfigured()) return { action: 'not-found' }

  const path = normalizeSignupsPath(request.nextUrl.pathname)
  if (request.method === 'GET' && path === SIGNUPS_LOGIN) {
    return { action: 'next', csrf: randomBase64Url(32) }
  }
  if (isSignupsLoginPath(path)) return { action: 'next', csrf: null }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token, signupsSessionSecret()) : null
  if (!session) return { action: 'redirect' }
  return { action: 'next', csrf: null }
}
