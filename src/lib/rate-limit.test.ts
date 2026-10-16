import { describe, expect, it } from 'vitest'
import { consumeRateLimit, retryAfterSeconds } from './rate-limit'
import { createTestDatabase } from '@/test/db'

describe('consumeRateLimit', () => {
  it('counts a burst in one statement so parallel calls stay inside the limit', async () => {
    const { db, close } = await createTestDatabase()
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeRateLimit(db, 'burst', 5, 60_000, 1_000)),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(5)
    expect(results.filter((result) => !result.ok)).toHaveLength(7)
    const blocked = results.find((result) => !result.ok)
    expect(blocked?.resetAt).toBe(1_000 + 60_000)
    expect(retryAfterSeconds(blocked?.resetAt ?? 0, 1_000)).toBe(60)
    expect(retryAfterSeconds(1_000, 1_000)).toBe(1)
    await close()
  })
})
