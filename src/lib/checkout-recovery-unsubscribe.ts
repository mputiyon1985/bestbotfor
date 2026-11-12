import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { checkoutRecoverySuppressions } from './db/schema'
import { emailSchema } from './validation'

export const CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET = 'CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET'
export const CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH = '/checkout-recovery/unsubscribe'
const TOKEN_VERSION = 1

/** Lowercase form used as the suppression key. Null when the address is not a valid email. */
export function normalizeRecoveryEmail(email: string): string | null {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return null
  return parsed.data.toLowerCase()
}

export function unsubscribeSecret(env: Record<string, string | undefined>): string | null {
  const secret = env[CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET] ?? ''
  if (secret.length < 32 || /[\r\n]/.test(secret)) return null
  return secret
}

function mac(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`bestbotfor-checkout-recovery-unsub|v1|${email}`).digest('base64url')
}

/** Signed token for one address. Null when the secret or the address is unusable. */
export function checkoutRecoveryUnsubscribeToken(secret: string, email: string): string | null {
  if (secret.length < 32 || /[\r\n]/.test(secret)) return null
  const normalized = normalizeRecoveryEmail(email)
  if (!normalized) return null
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, e: normalized }), 'utf8').toString('base64url')
  return `${payload}.${mac(secret, normalized)}`
}

/** Email inside a token, or null when the signature does not match. */
export function checkoutRecoveryUnsubscribeEmail(secret: string, token: string): string | null {
  if (secret.length < 32 || /[\r\n]/.test(secret)) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null
  const payload = token.slice(0, dot)
  const presented = token.slice(dot + 1)
  let email: string
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { v?: unknown; e?: unknown }
    if (json.v !== TOKEN_VERSION || typeof json.e !== 'string') return null
    const normalized = normalizeRecoveryEmail(json.e)
    if (!normalized || normalized !== json.e) return null
    email = normalized
  } catch {
    return null
  }
  const expected = mac(secret, email)
  const left = Buffer.from(presented)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return email
}

export async function recoveryEmailSuppressed(db: Database, email: string): Promise<boolean> {
  const normalized = normalizeRecoveryEmail(email)
  if (!normalized) return false
  const rows = await db
    .select({ email: checkoutRecoverySuppressions.email })
    .from(checkoutRecoverySuppressions)
    .where(eq(checkoutRecoverySuppressions.email, normalized))
    .limit(1)
  return rows.length > 0
}

/** Insert the opt-out once. A second call for the same address changes nothing. */
export async function suppressRecoveryEmail(
  db: Database,
  email: string,
  source: 'one_click' | 'confirm',
  now: number,
): Promise<boolean> {
  const normalized = normalizeRecoveryEmail(email)
  if (!normalized) return false
  await db
    .insert(checkoutRecoverySuppressions)
    .values({ email: normalized, suppressedAt: now, source })
    .onConflictDoNothing()
  return true
}

export type UnsubscribePage = { status: number; html: string }

function page(status: number, body: string): UnsubscribePage {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Unsubscribe</title></head><body><main>${body}</main></body></html>`
  return { status, html }
}

function tokenEmail(env: Record<string, string | undefined>, token: string): string | null {
  const secret = unsubscribeSecret(env)
  if (!secret) return null
  return checkoutRecoveryUnsubscribeEmail(secret, token)
}

/** Confirmation only. A GET does not record the opt-out. */
export function readUnsubscribe(env: Record<string, string | undefined>, token: string): UnsubscribePage {
  const email = tokenEmail(env, token)
  if (!email) return page(400, '<p>This unsubscribe link is not valid.</p>')
  const action = `${CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`
  return page(
    200,
    `<p>This stops BestBotFor checkout recovery email for the address that received the link.</p><form method="post" action="${action}"><button type="submit">Unsubscribe</button></form><p>You can also email privacy@bestbotfor.com with the subject Unsubscribe.</p>`,
  )
}

/**
 * Records the opt-out. RFC 8058 one-click posts `List-Unsubscribe=One-Click`.
 * The confirmation form is a normal POST. Neither requires a login.
 */
export async function recordUnsubscribe(
  db: Database,
  env: Record<string, string | undefined>,
  token: string,
  body: string,
  now: number,
): Promise<UnsubscribePage> {
  const email = tokenEmail(env, token)
  if (!email) return page(400, '<p>This unsubscribe link is not valid.</p>')
  const source = body.includes('List-Unsubscribe=One-Click') ? 'one_click' : 'confirm'
  await suppressRecoveryEmail(db, email, source, now)
  return page(200, '<p>You are unsubscribed from BestBotFor checkout recovery email.</p>')
}
