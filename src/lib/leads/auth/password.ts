import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { leadsAuthConfigured } from '../paths'

/**
 * The leads password, or null when the page must fail closed.
 * The raw env value is kept, including spaces. It is never logged.
 * SIGNUPS_SESSION_SECRET, RATE_LIMIT_HMAC_SECRET, and the Clerk and Stripe
 * secrets stay with their own features. The session key is derived from this
 * password so changing it invalidates sessions.
 */
export function leadsPassword(value: string | undefined = process.env.BBF_LEADS_PASSWORD): string | null {
  if (!leadsAuthConfigured(value)) return null
  return value ?? null
}

const COMPARE_LABEL = 'bestbotfor/leads-password-compare/v1'
const COMPARE_LIMIT = 256

function digest(value: string): Buffer {
  const bounded = value.length > COMPARE_LIMIT ? value.slice(0, COMPARE_LIMIT) : value
  return createHmac('sha256', COMPARE_LABEL).update(bounded, 'utf8').digest()
}

/**
 * Constant-time password check. Both sides are hashed to 32 bytes first so
 * different lengths still reach timingSafeEqual. A match also requires the
 * original lengths to be equal and within 256 characters.
 */
export function leadsPasswordMatches(provided: string, expected: string): boolean {
  const left = digest(provided)
  const right = digest(expected)
  const equal = timingSafeEqual(left, right)
  return equal && provided.length === expected.length && provided.length > 0 && provided.length <= COMPARE_LIMIT && expected.length <= COMPARE_LIMIT
}
