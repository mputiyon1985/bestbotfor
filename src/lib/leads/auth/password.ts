import 'server-only'
import { scryptSync, timingSafeEqual } from 'node:crypto'

const COMPARE_LIMIT = 256
const SCRYPT = { N: 16384, r: 8, p: 1 } as const
const PASSWORD_SALT = 'bestbotfor/leads-password-compare-scrypt/v1'
const IMPORT_SALT = 'bestbotfor/leads-import-token-scrypt/v1'

/**
 * The leads password, or null when the page must fail closed.
 * The raw env value is kept, including spaces. It is never logged.
 */
export function leadsPassword(value: string | undefined = process.env.BBF_LEADS_PASSWORD): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > COMPARE_LIMIT) return null
  if (value.trim().length === 0) return null
  return value
}

/**
 * Bearer for POST /admin/leads/import. Not the page password.
 * Unset, blank, shorter than 32, or longer than 256 fails closed.
 * The value is never logged.
 */
export function leadsImportToken(value: string | undefined = process.env.BBF_LEADS_IMPORT_TOKEN): string | null {
  if (typeof value !== 'string') return null
  if (value.length < 32 || value.length > COMPARE_LIMIT) return null
  if (value.trim().length === 0) return null
  return value
}

function scryptEqual(provided: string, expected: string, salt: string): boolean {
  const leftInput = provided.length > COMPARE_LIMIT ? provided.slice(0, COMPARE_LIMIT) : provided
  const rightInput = expected.length > COMPARE_LIMIT ? expected.slice(0, COMPARE_LIMIT) : expected
  const left = scryptSync(leftInput, salt, 32, SCRYPT)
  const right = scryptSync(rightInput, salt, 32, SCRYPT)
  const equal = timingSafeEqual(left, right)
  return equal && provided.length === expected.length && provided.length > 0 && provided.length <= COMPARE_LIMIT && expected.length <= COMPARE_LIMIT
}

/**
 * Constant-time password check. Both sides are stretched with scrypt
 * (N=16384, r=8, p=1), the same cost as the signups admin password, then
 * compared with timingSafeEqual.
 */
export function leadsPasswordMatches(provided: string, expected: string): boolean {
  return scryptEqual(provided, expected, PASSWORD_SALT)
}

/** Constant-time check of the import bearer. Same scrypt cost as the password. */
export function leadsImportTokenMatches(provided: string, expected: string): boolean {
  return scryptEqual(provided, expected, IMPORT_SALT)
}
