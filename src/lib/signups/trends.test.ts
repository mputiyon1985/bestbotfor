import { describe, expect, it } from 'vitest'
import { overallTrend, signupTrends } from '@/lib/signups/trends'
import type { SourceResult } from '@/lib/signups/types'

const now = Date.parse('2026-06-15T12:00:00.000Z')

function source(partial: Partial<SourceResult> & Pick<SourceResult, 'source'>): SourceResult {
  return { ok: true, signups: [], total: 0, capped: false, ...partial }
}

describe('signup trends', () => {
  it('counts the last day, week, and 30 days and leaves a down source unavailable', () => {
    const results: SourceResult[] = [
      source({
        source: 'turso',
        total: 3,
        signups: [
          { source: 'turso', email: 'new@example.com', createdAt: '2026-06-15T11:00:00.000Z' },
          { source: 'turso', email: 'week@example.com', createdAt: '2026-06-10T12:00:00.000Z' },
          { source: 'turso', email: 'old@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
        ],
      }),
      source({ source: 'beehiiv', ok: false, total: null, signups: [] }),
      source({
        source: 'clerk',
        total: 1,
        signups: [{ source: 'clerk', email: 'month@example.com', createdAt: '2026-05-20T12:00:00.000Z' }],
      }),
    ]
    const trends = signupTrends(results, now)
    expect(trends.find((trend) => trend.source === 'turso')).toEqual({ source: 'turso', ok: true, day: 1, week: 2, month: 2 })
    expect(trends.find((trend) => trend.source === 'beehiiv')?.ok).toBe(false)
    expect(trends.find((trend) => trend.source === 'clerk')).toMatchObject({ ok: true, day: 0, week: 0, month: 1 })
    expect(overallTrend(trends)).toEqual({ day: 1, week: 2, month: 3, partial: true })
  })
})
