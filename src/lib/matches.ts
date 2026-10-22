import { isPageInRange, parsePageNumber } from './page-number'
import { isQuizMatchable, quizBudgetFit, rankTools, type QuizPick, type RankBudget, type ScoreableTool } from './scoring'
import type { Skill } from './validation'

export const matchBudgetLabel: Record<RankBudget, string> = {
  free: 'Free only',
  low: 'Low cost',
  any: 'Any budget',
}

/** Same choices as the quiz. A mid band is not offered. */
export const matchBudgets: RankBudget[] = ['any', 'free', 'low']

/** Six tools per all-matches page. */
export const MATCHES_PAGE_SIZE = 6

/** Public all-matches order uses one skill so the URL does not split by experience. */
export const MATCHES_SKILL: Skill = 'beginner'

export function seeAllMatchesLabel(count: number): string {
  return `See all ${count} ${count === 1 ? 'match' : 'matches'}`
}

/**
 * Every quiz-eligible tool that clears the minimum fit, ranked like the quiz
 * for this budget. Free and low keep only tools inside that budget. Any keeps
 * the full eligible list. Archived and unrated tools stay on their own pages.
 */
export function listMatches<T extends ScoreableTool>(tools: T[], budget: RankBudget): QuizPick<T>[] {
  const qualified = tools.filter(isQuizMatchable)
  const ranked = rankTools(qualified, { budget, skill: MATCHES_SKILL }).map((tool) => ({
    ...tool,
    budgetFit: quizBudgetFit(tool, budget),
    reason: tool.notes,
  }))
  if (budget === 'any') return ranked
  return ranked.filter((tool) => tool.budgetFit === 'within')
}

export function matchPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / MATCHES_PAGE_SIZE))
}

export function pageOfMatches<T>(matches: T[], page: number): T[] {
  const start = (page - 1) * MATCHES_PAGE_SIZE
  return matches.slice(start, start + MATCHES_PAGE_SIZE)
}

/** Canonical path. Page 1 omits `page` so it is not a second indexable URL. */
export function matchesPath(task: string, budget: RankBudget, page: number): string {
  const params = new URLSearchParams()
  params.set('task', task)
  params.set('view', 'all')
  if (budget !== 'any') params.set('budget', budget)
  if (page > 1) params.set('page', String(page))
  return `/result?${params.toString()}`
}

export function matchesPageRequest(rawPage: string, total: number): { page: number; pageCount: number } | null {
  const page = parsePageNumber(rawPage)
  if (page === null) return null
  const pageCount = matchPageCount(total)
  if (!isPageInRange(page, pageCount)) return null
  return { page, pageCount }
}
