import { createHmac } from 'node:crypto'
import { safeEqual } from './safe-equal'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('invalid base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function hotp(key: Buffer, counter: number, digits: number): string {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** RFC 6238 TOTP. `key` is the raw shared secret (not base32). */
export function totpRaw(key: Buffer, timeSeconds: number, step = 30, digits = 6): string {
  const counter = Math.floor(timeSeconds / step)
  return hotp(key, counter, digits)
}

export function totpCode(secretBase32: string, timeMs: number, digits = 6, step = 30): string {
  return totpRaw(base32Decode(secretBase32), Math.floor(timeMs / 1000), step, digits)
}

/**
 * Verify a 6-digit code. Accepts the current 30s step and ±1 step.
 * Checks every candidate so runtime does not depend on which step matched.
 */
export function verifyTotp(code: string, secretBase32: string, now = Date.now()): boolean {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false
  let key: Buffer
  try {
    key = base32Decode(secretBase32)
  } catch {
    return false
  }
  if (key.length < 10) return false
  const counter = Math.floor(now / 1000 / 30)
  let matched = false
  for (let offset = -1; offset <= 1; offset++) {
    const expected = hotp(key, counter + offset, 6)
    if (safeEqual(expected, normalized)) matched = true
  }
  return matched
}
