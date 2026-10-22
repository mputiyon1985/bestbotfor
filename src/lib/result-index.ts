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
 * Every match list (any budget, any page) is a longer copy of the task's
 * /best/<task> guide. It stays out of the index and out of the sitemap, and
 * its links are still followed.
 */
export function matchesRobots(): RobotsDirective {
  return { index: false, follow: true }
}

/**
 * Canonical for a match list: the task's /best guide when that guide exists
 * (the task has at least one match to lead it), else the list itself.
 */
export function matchesCanonicalPath(taskSlug: string, budget: RankBudget, page: number, hasBestPage: boolean): string {
  return hasBestPage ? `/best/${taskSlug}` : matchesPath(taskSlug, budget, page)
}
