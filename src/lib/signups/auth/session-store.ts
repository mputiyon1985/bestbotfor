import { signupsSessionSecret } from './config'
import { createSessionToken, verifySessionToken, type SessionPayload } from './session'
import { insertSignupsSession, revokeSignupsSession as deleteSignupsSession, sessionSecretTag, signupsSessionLive, signupsSessionRecordId } from './store'

export type { SessionPayload }

/** Sign a session and store a hash of its id. Logout deletes that row. */
export async function issueSignupsSession(secret: string, now = Date.now()): Promise<{ token: string; payload: SessionPayload }> {
  const issued = await createSessionToken(secret, now)
  await insertSignupsSession(signupsSessionRecordId(secret, issued.payload.sid), issued.payload.exp, sessionSecretTag(secret), now)
  return issued
}

/** Delete the stored row for a raw session id from the cookie. */
export async function revokeSignupsSession(sid: string, secret = signupsSessionSecret()): Promise<void> {
  await deleteSignupsSession(signupsSessionRecordId(secret, sid))
}

/**
 * Signature, expiry, and the site-database row must all pass.
 * A database error or a secret tag from an older secret refuses the token.
 */
export async function verifyActiveSession(token: string, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  const payload = await verifySessionToken(token, secret, now)
  if (!payload) return null
  try {
    const live = await signupsSessionLive(signupsSessionRecordId(secret, payload.sid), sessionSecretTag(secret), now)
    return live ? payload : null
  } catch {
    return null
  }
}
