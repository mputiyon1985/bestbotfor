import { isIP } from 'node:net'
import type { TestInfo } from '@playwright/test'

/**
 * Documentation-range IPv6. Each group is at most four hex digits.
 * `Date.now().toString(16)` is about eleven digits and is not a valid group.
 */
export function e2eClientAddress(nonce: number, salt = 0): string {
  const n = Math.abs(Math.trunc(nonce))
  const s = Math.abs(Math.trunc(salt))
  const groups = [
    Math.floor(n / 2 ** 32) & 0xffff,
    Math.floor(n / 2 ** 16) & 0xffff,
    n & 0xffff,
    Math.floor(s / 2 ** 16) & 0xffff,
    s & 0xffff,
    1,
  ]
  const address = `2001:db8:${groups.map((group) => group.toString(16)).join(':')}`
  if (isIP(address) !== 6) throw new Error(`e2e client address is not an IPv6 address: ${address}`)
  return address
}

/** One address per test, stable for that test's page and API requests. */
export function e2eClientAddressForTest(testInfo: TestInfo): string {
  const hex = testInfo.testId.replace(/[^0-9a-f]/gi, '').padEnd(8, '0')
  const fromId = Number.parseInt(hex.slice(0, 8), 16)
  const salt = ((testInfo.parallelIndex & 0xff) << 8) | ((testInfo.workerIndex & 0xf) << 4) | (testInfo.retry & 0xf)
  return e2eClientAddress(fromId, salt)
}
