import { createHmac } from 'node:crypto'
import { getDb } from '@/lib/db'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 8

function database() {
  return getDb().$client
}

export function sessionSecretTag(secret: string): string {
  return createHmac('sha256', secret).update('bestbotfor-signups-session-tag|v1').digest('hex')
}

/** Stored session id. The cookie still carries the raw sid. */
export function signupsSessionRecordId(secret: string, sid: string): string {
  return createHmac('sha256', secret).update(`bestbotfor-signups-session-id|v1|${sid}`).digest('hex')
}

export async function insertSignupsSession(id: string, expiresAt: number, secretTag: string, now: number): Promise<void> {
  const db = database()
  await db.execute({
    sql: 'INSERT INTO signups_sessions (id, expires_at, secret_tag, created_at) VALUES (?, ?, ?, ?)',
    args: [id, expiresAt, secretTag, now],
  })
  await db.execute({
    sql: 'DELETE FROM signups_sessions WHERE expires_at <= ?',
    args: [Math.floor(now / 1000)],
  })
}

/** True only while the row exists, has not expired, and was issued under the current secret. */
export async function signupsSessionLive(id: string, secretTag: string, now: number): Promise<boolean> {
  const db = database()
  const result = await db.execute({
    sql: 'SELECT secret_tag, expires_at FROM signups_sessions WHERE id = ?',
    args: [id],
  })
  const row = result.rows[0]
  if (!row) return false
  const expiresAt = Number(row.expires_at)
  const stored = String(row.secret_tag)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now || stored !== secretTag) {
    await revokeSignupsSession(id)
    return false
  }
  return true
}

export async function revokeSignupsSession(id: string): Promise<void> {
  await database().execute({
    sql: 'DELETE FROM signups_sessions WHERE id = ?',
    args: [id],
  })
}

/**
 * Claim one authenticator time step. A second claim of the same step returns
 * false. Older steps are removed so the table stays a short window.
 */
export async function claimTotpStep(step: number, now: number): Promise<boolean> {
  const db = database()
  const inserted = await db.execute({
    sql: 'INSERT INTO signups_totp_steps (step, used_at) VALUES (?, ?) ON CONFLICT(step) DO NOTHING',
    args: [step, now],
  })
  await db.execute({
    sql: 'DELETE FROM signups_totp_steps WHERE step < ?',
    args: [step - 2],
  })
  return Number(inserted.rowsAffected) > 0
}

/**
 * Count one credential attempt and drop expired rows.
 * True while this attempt is still inside the window of 8.
 * The insert and the count are one statement, so a burst cannot slip past the cap.
 */
export async function consumeLoginAttempt(bucket: string, now = Date.now()): Promise<boolean> {
  const db = database()
  await db.execute({
    sql: 'DELETE FROM signups_login_attempts WHERE ? - window_start > ?',
    args: [now, LOGIN_WINDOW_MS],
  })
  const result = await db.execute({
    sql: `INSERT INTO signups_login_attempts (bucket, failures, window_start) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET
        failures = CASE
          WHEN ? - signups_login_attempts.window_start > ? THEN 1
          ELSE signups_login_attempts.failures + 1
        END,
        window_start = CASE
          WHEN ? - signups_login_attempts.window_start > ? THEN ?
          ELSE signups_login_attempts.window_start
        END
      RETURNING failures`,
    args: [bucket, now, now, LOGIN_WINDOW_MS, now, LOGIN_WINDOW_MS, now],
  })
  const failures = Number(result.rows[0]?.failures)
  return Number.isFinite(failures) && failures <= LOGIN_MAX_FAILURES
}

export async function clearLoginFailures(bucket: string): Promise<void> {
  await database().execute({
    sql: 'DELETE FROM signups_login_attempts WHERE bucket = ?',
    args: [bucket],
  })
}
