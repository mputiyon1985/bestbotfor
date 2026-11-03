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

  it('hashes the whole test id, so tests that share the first 8 hex digits differ', () => {
    const info = { testId: 'abcdef12-chat-quiz', retry: 1 }
    const address = e2eClientAddressForTest(info as TestInfo)
    expect(isIP(address)).toBe(6)
    expect(canonicalIp(address)).not.toBeNull()
    expect(e2eClientAddressForTest(info as TestInfo)).toBe(address)
    const sameFile = e2eClientAddressForTest({ testId: 'abcdef12-tools-page', retry: 1 } as TestInfo)
    expect(sameFile).not.toBe(address)
    const prefixes = [address, sameFile].map((value) => canonicalIp(value)!.split(':').slice(0, 4).join(':'))
    expect(prefixes[0]).not.toBe(prefixes[1])
  })
})
