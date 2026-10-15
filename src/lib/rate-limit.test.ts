import { describe, expect, it } from 'vitest'
import { consumeRateLimit } from './rate-limit'
import { createTestDatabase } from '@/test/db'

describe('consumeRateLimit', () => {
  it('counts a burst in one statement so parallel calls stay inside the limit', async () => {
    const { db, close } = await createTestDatabase()
    const results = await Promise.all(
      Array.from({ length: 12 }, () => consumeRateLimit(db, 'burst', 5, 60_000, 1_000)),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(5)
    expect(results.filter((result) => !result.ok)).toHaveLength(7)
    await close()
  })
})
