import { matchBudgetLabel, matchesPath } from './matches'
import type { RankBudget } from './scoring'

export type RobotsDirective = { index: boolean; follow: boolean }

/**
 * Document title for a match list. Task names are verb phrases ("Write code"),
 * so "All matches for write code" reads badly. Keep the task's own capitalization.
 */
export function matchesPageTitle(taskName: string, budget: RankBudget, page: number): string {
  const parts = [`${taskName} matches`]
  if (budget !== 'any') parts.push(matchBudgetLabel[budget].toLowerCase())
  if (page > 1) parts.push(`page ${page}`)
  return parts.join(', ')
}

/** Document title for one quiz result. The task name stays in its catalog form. */
export function quizResultTitle(taskName: string, pickName: string): string {
  return `${taskName}: ${pickName}`
}

/** Every quiz combination is a near-duplicate of that task's match list. */
export function quizResultRobots(): RobotsDirective {
  return { index: false, follow: true }
}

/**
 * Budget filters repeat the unfiltered list with rows removed. Page 1 of the
 * unfiltered list is the indexable URL. Later pages of that list stay
 * indexable and point at each other with rel next/prev.
 */
export function matchesRobots(budget: RankBudget): RobotsDirective {
  if (budget !== 'any') return { index: false, follow: true }
  return { index: true, follow: true }
}

/** Sitemap entry: unfiltered match list, page 1, with no budget parameter. */
export function indexableMatchPath(taskSlug: string): string {
  return matchesPath(taskSlug, 'any', 1)
}
