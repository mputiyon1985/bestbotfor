import type { SourceId, SourceResult } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export type SourceTrend = {
  source: SourceId
  ok: boolean
  day: number
  week: number
  month: number
}

export type OverallTrend = {
  day: number
  week: number
  month: number
  partial: boolean
}

function countSince(rows: readonly { createdAt: string }[], now: number, windowMs: number): number {
  const start = now - windowMs
  let count = 0
  for (const row of rows) {
    const time = Date.parse(row.createdAt)
    if (Number.isFinite(time) && time >= start && time <= now) count += 1
  }
  return count
}

/** Counts from rows already loaded. An unavailable source stays unavailable, not zero. */
export function signupTrends(results: readonly SourceResult[], now = Date.now()): SourceTrend[] {
  return results.map((result) => {
    if (!result.ok) return { source: result.source, ok: false, day: 0, week: 0, month: 0 }
    return {
      source: result.source,
      ok: true,
      day: countSince(result.signups, now, DAY_MS),
      week: countSince(result.signups, now, 7 * DAY_MS),
      month: countSince(result.signups, now, 30 * DAY_MS),
    }
  })
}

export function overallTrend(trends: readonly SourceTrend[]): OverallTrend {
  const ok = trends.filter((trend) => trend.ok)
  return {
    day: ok.reduce((sum, trend) => sum + trend.day, 0),
    week: ok.reduce((sum, trend) => sum + trend.week, 0),
    month: ok.reduce((sum, trend) => sum + trend.month, 0),
    partial: trends.some((trend) => !trend.ok),
  }
}
