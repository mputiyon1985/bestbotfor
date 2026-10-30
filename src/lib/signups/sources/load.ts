import 'server-only'
import { fetchBeehiivSignups } from './beehiiv'
import { fetchClerkSignups } from './clerk'
import { fetchTursoSignups } from './turso'
import { unavailable, type Signup, type SourceResult } from '../types'

async function settle(source: SourceResult['source'], load: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await load()
  } catch {
    console.error(`source unavailable: ${source}`)
    return unavailable(source)
  }
}

/**
 * Each source is loaded for this request only. Results are not written to the
 * Next.js data cache and are not kept for a later request. One failure does
 * not drop the others.
 */
export async function loadAllSources(): Promise<SourceResult[]> {
  return Promise.all([
    settle('turso', fetchTursoSignups),
    settle('beehiiv', fetchBeehiivSignups),
    settle('clerk', fetchClerkSignups),
  ])
}

export function combineSignups(results: readonly SourceResult[]): Signup[] {
  return results
    .flatMap((result) => (result.ok ? result.signups : []))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
