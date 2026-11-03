import { isIP } from 'node:net'
import type { TestInfo } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { e2eClientAddress, e2eClientAddressForTest } from '../../e2e/client-address'
import { canonicalIp } from './reviews/ip'

describe('e2eClientAddress', () => {
  it('splits a timestamp into groups of at most four hex digits', () => {
    const overlong = `2001:db8:f404::${Date.now().toString(16)}`
    expect(isIP(overlong)).toBe(0)
    expect(canonicalIp(overlong)).toBeNull()

    const address = e2eClientAddress(Date.now(), 0xf404)
    expect(isIP(address)).toBe(6)
    expect(canonicalIp(address)).not.toBeNull()
    for (const group of address.split(':')) expect(group.length).toBeLessThanOrEqual(4)
    expect(e2eClientAddress(Date.now(), 0xf404)).not.toBe(e2eClientAddress(Date.now(), 0xdb8))
  })

  it('keeps one stable address per test id', () => {
    const info = { testId: 'abc123def456', parallelIndex: 2, workerIndex: 3, retry: 1 } as TestInfo
    const address = e2eClientAddressForTest(info)
    expect(isIP(address)).toBe(6)
    expect(canonicalIp(address)).not.toBeNull()
    expect(e2eClientAddressForTest(info)).toBe(address)
    const other = e2eClientAddressForTest({ ...info, testId: 'fff123def456', retry: 0 } as TestInfo)
    expect(canonicalIp(other)).not.toBeNull()
    expect(other).not.toBe(address)
  })
})
