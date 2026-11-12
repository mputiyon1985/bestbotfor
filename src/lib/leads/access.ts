import 'server-only'
import { cookies } from 'next/headers'
import { readCookie } from '@/lib/signups/auth/cookies'
import { leadsPassword } from './auth/password'
import { LEADS_SESSION_COOKIE, verifyLeadsSession, type LeadsSession } from './auth/session'

export type LeadsAccess =
  | { configured: false; session: null }
  | { configured: true; session: LeadsSession | null }

/**
 * Password session for the leads page. Pass the route Request so a unit test
 * does not need the Next.js cookie store. Pages omit it and read the cookie jar.
 * A missing password, a bad signature, or an expired cookie is not a session.
 */
export async function requireLeadsSession(request?: Request): Promise<LeadsAccess> {
  const password = leadsPassword()
  if (!password) return { configured: false, session: null }
  const raw = request ? readCookie(request, LEADS_SESSION_COOKIE) : (await cookies()).get(LEADS_SESSION_COOKIE)?.value
  const session = raw ? verifyLeadsSession(raw, password) : null
  return { configured: true, session }
}
