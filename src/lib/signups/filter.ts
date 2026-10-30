import type { Signup, SourceId } from './types'

export type SourceFilter = 'all' | SourceId

export function filterSignups(rows: readonly Signup[], source: SourceFilter, query: string): Signup[] {
  const needle = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (source !== 'all' && row.source !== source) return false
    if (needle && !row.email.toLowerCase().includes(needle)) return false
    return true
  })
}
