import type { Client } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { consumeLocalRateLimit, consumeRateLimit, localRateLimitSize, persistResultRateLimit, resetLocalRateLimits, retryAfterSeconds } from './rate-limit'
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

  it('returns the in-memory decision before a slow shared write finishes', async () => {
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    const execute = db.$client.execute.bind(db.$client)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    db.$client.execute = (async (...args: Parameters<Client['execute']>) => {
      await gate
      return execute(...args)
    }) as Client['execute']
    try {
      const started = Date.now()
      const local = consumeLocalRateLimit('slow-shared', 5, 60_000, 1_000)
      const pending = persistResultRateLimit(db, 'slow-shared', 5, 60_000, 1_000)
      expect(local.ok).toBe(true)
      expect(Date.now() - started).toBeLessThan(50)
      release()
      await pending
    } finally {
      resetLocalRateLimits()
      await close()
    }
  })

  it('drops expired in-memory windows once the map is large', () => {
    resetLocalRateLimits()
    for (let index = 0; index < 40; index += 1) consumeLocalRateLimit(`old-${index}`, 5, 1_000, 0)
    expect(localRateLimitSize()).toBe(40)
    consumeLocalRateLimit('fresh', 5, 1_000, 1_000)
    expect(localRateLimitSize()).toBe(1)
    resetLocalRateLimits()
  })
})
