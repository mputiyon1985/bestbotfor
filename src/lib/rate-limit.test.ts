import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import * as schema from './db/schema'
import {
  consumeLocalRateLimit,
  consumeRateLimit,
  consumeResultRateLimit,
  consumeSharedResultWindow,
  localRateLimitSize,
  purgeExpiredResultWindows,
  RESULT_SHARED_LIMIT_MS,
  resetLocalRateLimits,
  retryAfterSeconds,
} from './rate-limit'
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

  it('keeps the shared /result wait short enough that a slow store falls back to memory', async () => {
    expect(RESULT_SHARED_LIMIT_MS).toBeLessThanOrEqual(500)
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
      const decision = await consumeResultRateLimit(db, 'slow-shared', 5, 60_000, 1_000, 40)
      expect(decision.ok).toBe(true)
      expect(Date.now() - started).toBeLessThan(300)
      release()
    } finally {
      resetLocalRateLimits()
      await close()
    }
  })

  it('lets the shared fixed window reject a request this process has forgotten', async () => {
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    try {
      for (let index = 0; index < 5; index += 1) {
        const allowed = await consumeResultRateLimit(db, 'shared-wins', 5, 60_000, 1_000)
        expect(allowed.ok).toBe(true)
      }
      resetLocalRateLimits()
      const blocked = await consumeResultRateLimit(db, 'shared-wins', 5, 60_000, 1_000)
      expect(blocked.ok).toBe(false)
      expect(blocked.resetAt).toBe(60_000)
    } finally {
      resetLocalRateLimits()
      await close()
    }
  })

  it('counts one fixed window across two connections and drops closed windows', async () => {
    const { db, url, close } = await createTestDatabase()
    const other = drizzle(createClient({ url }), { schema })
    try {
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          consumeSharedResultWindow(index % 2 === 0 ? db : other, 'two-connections', 30, 60_000, 1_000, 2_000),
        ),
      )
      expect(results.every((result) => result !== null)).toBe(true)
      expect(results.filter((result) => result?.ok)).toHaveLength(30)
      expect(results.filter((result) => result && !result.ok)).toHaveLength(10)

      await consumeSharedResultWindow(db, 'closed-window', 5, 1_000, 0, 2_000)
      await consumeSharedResultWindow(db, 'open-window', 5, 1_000, 1_000, 2_000)
      await purgeExpiredResultWindows(db, 1_000)
      const rows = await db.$client.execute('SELECT expires_at FROM result_rate_windows ORDER BY expires_at')
      const expires = rows.rows.map((row) => Number(row.expires_at))
      expect(expires).toContain(2_000)
      expect(expires).not.toContain(1_000)
    } finally {
      other.$client.close()
      await close()
    }
  })

  it('uses memory when the shared store throws', async () => {
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    db.$client.execute = (async () => {
      throw new Error('down')
    }) as Client['execute']
    try {
      const decision = await consumeResultRateLimit(db, 'store-down', 5, 60_000, 1_000)
      expect(decision.ok).toBe(true)
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
