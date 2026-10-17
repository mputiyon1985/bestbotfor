import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it, vi } from 'vitest'
import * as schema from './db/schema'
import {
  consumeLocalRateLimit,
  consumeRateLimit,
  consumeResultRateLimit,
  consumeSharedResultWindow,
  localRateLimitSize,
  purgeExpiredResultWindows,
  resetLocalRateLimits,
  resetResultRateFallbackCount,
  RESULT_SHARED_LIMIT_MS,
  resultRateFallbackCount,
  resultSharedLimitMs,
  retryAfterSeconds,
} from './rate-limit'
import { createTestDatabase } from '@/test/db'

function fallbackEvent(errors: unknown[][], index = 0): Record<string, unknown> {
  const parsed = errors.flatMap((args) => {
    if (typeof args[0] !== 'string') return []
    try {
      const value = JSON.parse(args[0]) as Record<string, unknown>
      return value.event === 'result_rate_limit_fallback' ? [value] : []
    } catch {
      return []
    }
  })
  const event = parsed[index]
  expect(event).toBeDefined()
  return event ?? {}
}

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

  it('defaults the shared budget to 1000ms and ignores an env value outside 50–2500', () => {
    expect(RESULT_SHARED_LIMIT_MS).toBe(1_000)
    const previous = process.env.RESULT_SHARED_LIMIT_MS
    try {
      delete process.env.RESULT_SHARED_LIMIT_MS
      expect(resultSharedLimitMs()).toBe(1_000)
      process.env.RESULT_SHARED_LIMIT_MS = '1500'
      expect(resultSharedLimitMs()).toBe(1_500)
      process.env.RESULT_SHARED_LIMIT_MS = '50'
      expect(resultSharedLimitMs()).toBe(50)
      process.env.RESULT_SHARED_LIMIT_MS = '2500'
      expect(resultSharedLimitMs()).toBe(2_500)
      for (const raw of ['49', '2501', '0', 'nope', '']) {
        process.env.RESULT_SHARED_LIMIT_MS = raw
        expect(resultSharedLimitMs(), raw).toBe(1_000)
      }
      expect(resultSharedLimitMs(40)).toBe(40)
    } finally {
      if (previous === undefined) delete process.env.RESULT_SHARED_LIMIT_MS
      else process.env.RESULT_SHARED_LIMIT_MS = previous
    }
  })

  it('keeps the shared /result wait inside its budget and falls back to memory', async () => {
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    resetResultRateFallbackCount()
    const execute = db.$client.execute.bind(db.$client)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    db.$client.execute = (async (...args: Parameters<Client['execute']>) => {
      await gate
      return execute(...args)
    }) as Client['execute']
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })
    try {
      const started = Date.now()
      const decision = await consumeResultRateLimit(db, '203.0.113.7', 5, 60_000, 1_000, 40)
      expect(decision.ok).toBe(true)
      expect(Date.now() - started).toBeLessThan(300)
      const event = fallbackEvent(errors)
      expect(event.reason).toBe('timeout')
      expect(event.budgetMs).toBe(40)
      expect(event.count).toBe(1)
      expect(resultRateFallbackCount()).toBe(1)
      expect(JSON.stringify(event)).not.toContain('203.0.113.7')
      release()
    } finally {
      spy.mockRestore()
      resetLocalRateLimits()
      resetResultRateFallbackCount()
      await close()
    }
  })

  it('uses RESULT_SHARED_LIMIT_MS when the caller does not pass a budget', async () => {
    const previous = process.env.RESULT_SHARED_LIMIT_MS
    process.env.RESULT_SHARED_LIMIT_MS = '80'
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    resetResultRateFallbackCount()
    const execute = db.$client.execute.bind(db.$client)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    db.$client.execute = (async (...args: Parameters<Client['execute']>) => {
      await gate
      return execute(...args)
    }) as Client['execute']
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })
    try {
      const started = Date.now()
      const decision = await consumeResultRateLimit(db, 'env-budget', 5, 60_000, 1_000)
      expect(decision.ok).toBe(true)
      expect(Date.now() - started).toBeGreaterThanOrEqual(70)
      expect(Date.now() - started).toBeLessThan(300)
      expect(fallbackEvent(errors).budgetMs).toBe(80)
      expect(fallbackEvent(errors).reason).toBe('timeout')
    } finally {
      release()
      spy.mockRestore()
      resetLocalRateLimits()
      resetResultRateFallbackCount()
      if (previous === undefined) delete process.env.RESULT_SHARED_LIMIT_MS
      else process.env.RESULT_SHARED_LIMIT_MS = previous
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
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args)
    })
    resetResultRateFallbackCount()
    try {
      const decision = await consumeResultRateLimit(db, 'store-down', 5, 60_000, 1_000)
      expect(decision.ok).toBe(true)
      const event = fallbackEvent(errors)
      expect(event.reason).toBe('error')
      expect(event.errorName).toBe('Error')
      expect(event.count).toBe(1)
      expect(JSON.stringify(event)).not.toContain('down')
      expect(JSON.stringify(event)).not.toContain('store-down')
      const again = await consumeResultRateLimit(db, 'store-down', 5, 60_000, 1_000)
      expect(again.ok).toBe(true)
      expect(resultRateFallbackCount()).toBe(2)
      expect(fallbackEvent(errors, 1).count).toBe(2)
    } finally {
      spy.mockRestore()
      resetResultRateFallbackCount()
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
