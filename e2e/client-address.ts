import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { TestInfo } from '@playwright/test'

/**
 * Documentation-range IPv6. Each group is at most four hex digits.
 * `Date.now().toString(16)` is about eleven digits and is not a valid group.
 */
export function e2eClientAddress(nonce: number, salt = 0): string {
  const n = Math.abs(Math.trunc(nonce))
  const s = Math.abs(Math.trunc(salt))
  // 2001:db8 plus these two groups are the /64 a rate-limit key uses.
  // A salt that only changes later groups shares one quiz window.
  const prefixHi = (Math.floor(n / 2 ** 32) ^ s) & 0xffff
  const prefixLo = (Math.floor(n / 2 ** 16) ^ Math.floor(s / 0x10000)) & 0xffff
  const groups = [prefixHi, prefixLo, n & 0xffff, Math.floor(s / 0x10000) & 0xffff, s & 0xffff, 1]
  const address = `2001:db8:${groups.map((group) => group.toString(16)).join(':')}`
  if (isIP(address) !== 6) throw new Error(`e2e client address is not an IPv6 address: ${address}`)
  return address
}

/**
 * One address per test. The hash covers the whole test id. The first 8 hex
 * digits are shared by tests in a file, so they are not the address.
 * Retry is included so a second attempt does not reuse a full window.
 */
export function e2eClientAddressForTest(testInfo: Pick<TestInfo, 'testId' | 'retry'>): string {
  const digest = createHash('sha256').update(`${testInfo.testId}\0${testInfo.retry}`).digest()
  const nonce = digest.readUIntBE(0, 6)
  const salt = digest.readUInt32BE(6)
  return e2eClientAddress(nonce, salt)
}
