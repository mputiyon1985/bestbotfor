import { freePlanHolds, freePlanNotes, freePlanOfficialDomains } from '@/data/free-plan-notes'
import { toolSeeds } from '@/data/catalog'
import type { FreePlanFields } from './catalog-types'
import { FREE_PAGE_TOOL_COUNT, freePageIndexable, freePlanStatus, type FreePlanStatus } from './free-plan'
import { listMatches } from './matches'
import type { ScoreableTool } from './scoring'

export type FreePageTool<T> = T & {
  freePlan: FreePlanFields | null
  freePlanStatus: FreePlanStatus
}

export type FreePageOverrides = {
  /** Treat these slugs as having no free-plan fields. Test hook only. */
  drop?: readonly string[]
}

const seedBySlug = new Map(toolSeeds.map((tool) => [tool.slug, tool]))

/**
 * Tools for /best/[task]/free: the same free ranking as /result budget=free
 * (listMatches), minus held tools, top six. Each carries its free-plan fields
 * and status; the page is indexable only when all of them are fresh.
 */
export function buildFreePage<T extends ScoreableTool & { slug: string }>(
  candidates: T[],
  now: number,
  overrides: FreePageOverrides = {},
  notes: Readonly<Record<string, FreePlanFields>> = freePlanNotes,
): { tools: FreePageTool<T>[]; indexable: boolean; totalFree: number } {
  const free = listMatches(candidates, 'free').filter((tool) => !(tool.slug in freePlanHolds))
  const dropped = new Set(overrides.drop ?? [])
  const tools = free.slice(0, FREE_PAGE_TOOL_COUNT).map((tool) => {
    const freePlan = dropped.has(tool.slug) ? null : (notes[tool.slug] ?? null)
    const seed = seedBySlug.get(tool.slug)
    const status = freePlanStatus(
      { slug: tool.slug, url: seed?.url ?? '', allowedHosts: seed?.allowedHosts ?? [], freePlan },
      now,
      freePlanOfficialDomains[tool.slug] ?? [],
    )
    return { ...tool, freePlan, freePlanStatus: status }
  })
  return { tools, indexable: freePageIndexable(tools.map((tool) => tool.freePlanStatus)), totalFree: free.length }
}
