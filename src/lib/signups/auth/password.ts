import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const N = 16384
const r = 8
const p = 1
const KEYLEN = 32
const DUMMY_SALT = Buffer.alloc(16, 7)

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p })
  return `scrypt:${N}:${r}:${p}:${salt.toString('base64url')}:${hash.toString('base64url')}`
}

function parseHash(stored: string): { salt: Buffer; hash: Buffer } | null {
  const parts = stored.split(':')
  if (parts.length !== 6) return null
  if (parts[0] !== 'scrypt') return null
  if (parts[1] !== String(N) || parts[2] !== String(r) || parts[3] !== String(p)) return null
  const salt = Buffer.from(parts[4] ?? '', 'base64url')
  const hash = Buffer.from(parts[5] ?? '', 'base64url')
  if (salt.length !== 16 || hash.length !== KEYLEN) return null
  return { salt, hash }
}

export function verifyPassword(password: string, stored: string): boolean {
  const candidate = password.length > 256 ? password.slice(0, 256) : password
  const parsed = parseHash(stored)
  let actual: Buffer
  try {
    actual = scryptSync(candidate, parsed?.salt ?? DUMMY_SALT, KEYLEN, { N, r, p })
  } catch {
    return false
  }
  if (!parsed || actual.length !== parsed.hash.length) return false
  return timingSafeEqual(actual, parsed.hash)
}
