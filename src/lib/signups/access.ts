import 'server-only'
import { cookies } from 'next/headers'
import { readCookie } from './auth/cookies'
import { signupsAuthConfigured, signupsSessionSecret } from './auth/config'
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from './auth/session'

export type SignupsAccess =
  | { configured: false; session: null }
  | { configured: true; session: SessionPayload | null }

/**
 * Password session for /admin/signups. Pass the route Request so a unit test
 * does not need the Next.js cookie store. Pages omit it and read the cookie jar.
 * A missing or short secret is not a session.
 */
export async function requireSignupsSession(request?: Request): Promise<SignupsAccess> {
  if (!signupsAuthConfigured()) return { configured: false, session: null }
  const raw = request ? readCookie(request, SESSION_COOKIE) : (await cookies()).get(SESSION_COOKIE)?.value
  const session = raw ? await verifySessionToken(raw, signupsSessionSecret()) : null
  return { configured: true, session }
}
