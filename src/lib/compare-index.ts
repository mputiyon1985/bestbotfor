import { comparePairSeeds, toolSeeds } from '@/data/catalog'

export const COMPARE_INDEX_PATH = '/compare'
export const COMPARE_INDEX_HEADING = 'Compare AI tools'

/** Every seeded comparison pair, from code only (no database read). */
export function compareIndexEntries(): { title: string; path: string }[] {
  const names = new Map(toolSeeds.map((tool) => [tool.slug, tool.name]))
  return comparePairSeeds.flatMap(([a, b]) => {
    const nameA = names.get(a)
    const nameB = names.get(b)
    if (!nameA || !nameB) return []
    return [{ title: `${nameA} vs ${nameB}`, path: `/compare/${a}-vs-${b}` }]
  })
}
