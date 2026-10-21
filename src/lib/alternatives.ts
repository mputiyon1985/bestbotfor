import { comparePairSeeds } from '@/data/catalog'
import { taskGerund } from './descriptions'
import { listMatches } from './matches'
import type { RankBudget } from './scoring'

/**
 * /alternatives/[tool] pages (docs/specs/seo-20-pages, pages 11 to 15). Each one
 * ranks the tools that fit the tool's main job, excluding the tool itself.
 */
export const ALTERNATIVE_PAGES = [
  { tool: 'chatgpt', task: 'chat' },
  { tool: 'midjourney', task: 'images' },
  { tool: 'zapier', task: 'automation' },
  { tool: 'cursor', task: 'coding' },
  { tool: 'elevenlabs', task: 'voice' },
  // Oct 21, 2026 starters: one per job, built only from catalog fits, prices, pros and cons.
  { tool: 'jasper', task: 'writing' },
  { tool: 'perplexity', task: 'research' },
  { tool: 'heygen', task: 'video' },
  { tool: 'lovable', task: 'vibe-coding' },
  { tool: 'fathom', task: 'meetings' },
] as const

export type AlternativePage = (typeof ALTERNATIVE_PAGES)[number]

/** Up to six alternatives, per the spec outline. */
export const ALTERNATIVES_COUNT = 6

/** Cons from the tool's own profile used as "why people switch" bullets. */
export const SWITCH_REASON_COUNT = 3

export function getAlternativePage(toolSlug: string): AlternativePage | undefined {
  return ALTERNATIVE_PAGES.find((page) => page.tool === toolSlug)
}

export function alternativesPath(toolSlug: string): string {
  return `/alternatives/${toolSlug}`
}

export function alternativesForTask(taskSlug: string): AlternativePage | undefined {
  return ALTERNATIVE_PAGES.find((page) => page.task === taskSlug)
}

export function alternativesTitle(toolName: string): string {
  return `${toolName} Alternatives: The Best Picks by Budget (2026)`
}

export function alternativesHeading(toolName: string): string {
  return `${toolName} alternatives`
}

/** The spec's meta, with the job named as a gerund ("for writing code") when it still fits in 155 characters. */
export function alternativesDescription(toolName: string, taskName?: string): string {
  const tail = 'ranked by fit and filtered by budget. Free options included. Or get your pick in 30 seconds.'
  if (taskName) {
    const withJob = `The best ${toolName} alternatives for ${taskGerund(taskName)}, ${tail}`
    if (withJob.length <= 155) return withJob
  }
  return `The best ${toolName} alternatives, ${tail}`
}

/** Budget chips. "any" is the canonical, indexable list. */
export const ALTERNATIVE_BUDGETS: readonly RankBudget[] = ['any', 'free', 'low']

export function parseAlternativeBudget(value: string | string[] | undefined): RankBudget | null {
  if (value === undefined) return 'any'
  if (typeof value !== 'string') return null
  return (ALTERNATIVE_BUDGETS as readonly string[]).includes(value) ? (value as RankBudget) : null
}

export function alternativesBudgetPath(toolSlug: string, budget: RankBudget): string {
  return budget === 'any' ? alternativesPath(toolSlug) : `${alternativesPath(toolSlug)}?budget=${budget}`
}

/** Ranked alternatives: same ranking as /result (listMatches), without the tool itself. */
export function rankAlternatives<T extends Parameters<typeof listMatches>[0][number]>(candidates: T[], toolSlug: string, budget: RankBudget) {
  return listMatches(
    candidates.filter((tool) => tool.slug !== toolSlug),
    budget,
  ).slice(0, ALTERNATIVES_COUNT)
}

/** comparePairSeeds that include the tool, as [left, right] slugs. */
export function comparePairsFor(toolSlug: string): (readonly [string, string])[] {
  return comparePairSeeds.filter(([left, right]) => left === toolSlug || right === toolSlug)
}
