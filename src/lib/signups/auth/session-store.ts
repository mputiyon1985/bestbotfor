import { createSessionToken, verifySessionToken, type SessionPayload } from './session'
import { insertSignupsSession, revokeSignupsSession, sessionSecretTag, signupsSessionLive } from './store'

export type { SessionPayload }
export { revokeSignupsSession }

/** Sign a session and store its id. Logout deletes that row. */
export async function issueSignupsSession(secret: string, now = Date.now()): Promise<{ token: string; payload: SessionPayload }> {
  const issued = await createSessionToken(secret, now)
  await insertSignupsSession(issued.payload.sid, issued.payload.exp, sessionSecretTag(secret), now)
  return issued
}

/**
 * Signature, expiry, and the site-database row must all pass.
 * A database error or a secret tag from an older secret refuses the token.
 */
export async function verifyActiveSession(token: string, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  const payload = await verifySessionToken(token, secret, now)
  if (!payload) return null
  try {
    const live = await signupsSessionLive(payload.sid, sessionSecretTag(secret), now)
    return live ? payload : null
  } catch {
    return null
  }
}
