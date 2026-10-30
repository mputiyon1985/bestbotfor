import 'server-only'
import { cached } from '../cache'
import { fetchBeehiivSignups } from './beehiiv'
import { fetchClerkSignups } from './clerk'
import { fetchTursoSignups } from './turso'
import { unavailable, type Signup, type SourceResult } from '../types'

const loadTurso = cached('signups-turso', fetchTursoSignups)
const loadBeehiiv = cached('signups-beehiiv', fetchBeehiivSignups)
const loadClerk = cached('signups-clerk', fetchClerkSignups)

async function settle(source: SourceResult['source'], load: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await load()
  } catch {
    console.error(`source unavailable: ${source}`)
    return unavailable(source)
  }
}

/** Each source is cached for 300s and isolated: one failure does not drop the others. */
export async function loadAllSources(): Promise<SourceResult[]> {
  return Promise.all([settle('turso', loadTurso), settle('beehiiv', loadBeehiiv), settle('clerk', loadClerk)])
}

export function combineSignups(results: readonly SourceResult[]): Signup[] {
  return results
    .flatMap((result) => (result.ok ? result.signups : []))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}
