import type { Client } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { ACTION_LIMITS } from './action-limit'
import { tasks } from './db/schema'
import { consumeResultRateLimit, resetLocalRateLimits } from './rate-limit'
import { decideResultGate, RESULT_GATE_BUDGET_MS, RESULT_LIMIT_BUDGET_MS } from './result-gate'
import { resultRequestStatus } from './result-request'
import { createTestDatabase } from '@/test/db'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runPool<T>(count: number, concurrency: number, work: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count)
  let next = 0
  async function worker(): Promise<void> {
    while (next < count) {
      const index = next
      next += 1
      results[index] = await work(index)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return results
}

describe('result burst', () => {
  it('returns no 503s for a slow valid quiz and still rejects the burst', async () => {
    expect(RESULT_GATE_BUDGET_MS).toBe(800)
    expect(RESULT_LIMIT_BUDGET_MS).toBe(3_000)
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    await db.insert(tasks).values({ slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk.' })
    const params = new URLSearchParams('task=chat&budget=any&skill=beginner')
    const key = `result-burst-${Date.now()}`
    const lookupLatency = RESULT_GATE_BUDGET_MS + 100

    try {
      const decisions = await runPool(40, 4, () =>
        decideResultGate({
          view: '',
          lookup: async () => {
            await delay(lookupLatency)
            return resultRequestStatus(db, params)
          },
          pageLookup: async () => {
            await delay(150)
            return resultRequestStatus(db, params)
          },
          limit: () =>
            consumeResultRateLimit(db, key, ACTION_LIMITS.result.limit, ACTION_LIMITS.result.windowMs),
        }),
      )

      const unavailable = decisions.filter((decision) => decision.type === 'unavailable')
      const limited = decisions.filter((decision) => decision.type === 'limited')
      const continued = decisions.filter((decision) => decision.type === 'continue')
      console.log(
        `result burst decisions ${JSON.stringify({ unavailable: unavailable.length, continue: continued.length, limited: limited.length, total: decisions.length })}`,
      )
      expect(unavailable).toHaveLength(0)
      expect(limited.length).toBeGreaterThan(0)
      expect(continued.length).toBe(ACTION_LIMITS.result.limit)
      expect(limited.length).toBe(40 - ACTION_LIMITS.result.limit)

      const missing = await decideResultGate({
        view: '',
        lookupBudgetMs: 40,
        lookup: () => new Promise(() => {}),
        pageLookup: () => resultRequestStatus(db, new URLSearchParams('task=marketing&budget=any&skill=beginner')),
        limit: async () => {
          throw new Error('limit should not run')
        },
      })
      expect(missing).toEqual({ type: 'not-found' })
    } finally {
      await delay(200)
      resetLocalRateLimits()
      await close()
    }
  }, 60_000)

  it('still returns 429s when the shared write outlasts the limiter deadline', async () => {
    const { db, close } = await createTestDatabase()
    resetLocalRateLimits()
    const execute = db.$client.execute.bind(db.$client)
    db.$client.execute = (async (...args: Parameters<Client['execute']>) => {
      await delay(200)
      return execute(...args)
    }) as Client['execute']
    const key = `result-slow-write-${Date.now()}`
    try {
      const decisions = await runPool(8, 4, () =>
        decideResultGate({
          view: '',
          limitBudgetMs: 40,
          lookup: async () => 'ok',
          pageLookup: async () => 'ok',
          limit: () => consumeResultRateLimit(db, key, 3, 60_000),
        }),
      )
      expect(decisions.filter((decision) => decision.type === 'unavailable')).toHaveLength(0)
      expect(decisions.filter((decision) => decision.type === 'limited').length).toBeGreaterThan(0)
      expect(decisions.filter((decision) => decision.type === 'continue').length).toBeLessThan(8)
    } finally {
      await delay(250)
      resetLocalRateLimits()
      await close()
    }
  })
})
