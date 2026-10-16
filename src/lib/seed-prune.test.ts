import { describe, expect, it } from 'vitest'
import { seedPruneEnabled } from '../../scripts/seed'

describe('SEED_PRUNE', () => {
  it('deletes leftover score rows only when the flag is exactly 1', () => {
    expect(seedPruneEnabled(undefined)).toBe(false)
    expect(seedPruneEnabled('')).toBe(false)
    expect(seedPruneEnabled('true')).toBe(false)
    expect(seedPruneEnabled('1 ')).toBe(false)
    expect(seedPruneEnabled('1')).toBe(true)
  })
})
