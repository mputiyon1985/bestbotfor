import { expect, request as playwrightRequest, test } from '@playwright/test'
import { ACTION_LIMITS } from '../src/lib/action-limit'

/**
 * Sentinel's check: 40 requests, 4 at a time, at a valid quiz URL.
 * A slow or healthy catalog must not answer 503. The limiter must still fire.
 */
test('40 valid quizzes at 4 concurrent return no 503s and some 429s', async () => {
  test.setTimeout(120_000)
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000'
  const context = await playwrightRequest.newContext({ baseURL })
  const headers = { 'x-forwarded-for': `2001:db8:40:4::${Date.now().toString(16)}` }
  const path = '/result?task=chat&budget=any&skill=beginner'
  const total = 40
  const concurrency = 4
  const counts: Record<number, number> = {}
  let next = 0

  async function worker(): Promise<void> {
    while (next < total) {
      next += 1
      const response = await context.get(path, { headers })
      const status = response.status()
      counts[status] = (counts[status] ?? 0) + 1
      await response.body()
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    const histogram = {
      '200': counts[200] ?? 0,
      '429': counts[429] ?? 0,
      '503': counts[503] ?? 0,
      other: Object.entries(counts)
        .filter(([status]) => status !== '200' && status !== '429' && status !== '503')
        .map(([status, count]) => `${status}:${count}`),
    }
    console.log(`sentinel result burst ${JSON.stringify(histogram)}`)
    expect(histogram['503'], JSON.stringify(histogram)).toBe(0)
    expect(histogram.other, JSON.stringify(histogram)).toEqual([])
    expect(histogram['429'], JSON.stringify(histogram)).toBe(total - ACTION_LIMITS.result.limit)
    expect(histogram['200'], JSON.stringify(histogram)).toBe(ACTION_LIMITS.result.limit)
  } finally {
    await context.dispose()
  }
})
