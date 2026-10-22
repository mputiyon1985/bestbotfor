import { skillLabel } from './format'
import { quizNeedsRating } from './quiz-gate'
import type { Budget, Skill } from './validation'

/** All-matches uses the same budgets as the quiz. */
export type RankBudget = Budget

/**
 * Editorial fit is the base score (0-100). Budget and skill add a bounded
 * adjustment so a poor fit cannot win on price alone, and affiliate status
 * is not an input. Nothing in this function reads affiliate fields.
 */
const SKILL_RANK: Record<Skill, number> = {
  beginner: 0,
  intermediate: 1,
  pro: 2,
}

export type ScoreableTool = {
  slug: string
  name: string
  skillLevel: Skill
  pricingModel: 'free' | 'freemium' | 'paid'
  hasFreeTier: boolean
  priceFromUsd: number | null
  fitScore: number
  notes: string
  /** False drops the tool from the quiz pick and its alternatives. Omitted means eligible. */
  quizEligible?: boolean
  /**
   * Editorial score; null means unrated. Only matters for tools added in #138
   * or later (quiz-gate.ts): those are left out of quiz matching while unrated
   * and stay on their category page, labeled Unrated.
   */
  editorial?: unknown
}

/**
 * Quiz matching gate: the minimum fit and quiz eligibility, plus an editorial
 * rating for tools added in #138 or later (no made-up match score for new
 * unrated tools). Older tools keep their original behavior.
 */
export function isQuizMatchable(tool: Pick<ScoreableTool, 'slug' | 'fitScore' | 'quizEligible' | 'editorial'>): boolean {
  if (tool.fitScore < MIN_QUIZ_FIT_SCORE || tool.quizEligible === false) return false
  return !(quizNeedsRating(tool.slug) && tool.editorial == null)
}

export type RankedTool = ScoreableTool & {
  score: number
  budgetDelta: number
  skillDelta: number
}

const LOW_BUDGET_USD = 30

function paidCap(budget: RankBudget): number | null {
  if (budget === 'low') return LOW_BUDGET_USD
  return null
}

export function budgetDelta(tool: Pick<ScoreableTool, 'pricingModel' | 'hasFreeTier' | 'priceFromUsd'>, budget: RankBudget): number {
  if (budget === 'any') return 0
  if (budget === 'free') {
    if (tool.pricingModel === 'free') return 18
    if (tool.hasFreeTier) return 10
    return -30
  }
  const cap = paidCap(budget) ?? LOW_BUDGET_USD
  if (tool.pricingModel === 'free' || tool.hasFreeTier) {
    if (tool.priceFromUsd != null && tool.priceFromUsd > cap) return 4
    return 12
  }
  if (tool.priceFromUsd == null) return 0
  if (tool.priceFromUsd <= cap) return 8
  return -12
}

export function skillDelta(toolSkill: Skill, userSkill: Skill): number {
  const gap = Math.abs(SKILL_RANK[toolSkill] - SKILL_RANK[userSkill])
  if (gap === 0) return 12
  if (gap === 1) return 0
  return -18
}

export function rankTools<T extends ScoreableTool>(
  tools: T[],
  answers: { budget: RankBudget; skill: Skill },
): Array<T & Pick<RankedTool, 'score' | 'budgetDelta' | 'skillDelta'>> {
  const ranked = tools.map((tool) => {
    const budgetAdjustment = budgetDelta(tool, answers.budget)
    const skillAdjustment = skillDelta(tool.skillLevel, answers.skill)
    return {
      ...tool,
      budgetDelta: budgetAdjustment,
      skillDelta: skillAdjustment,
      score: tool.fitScore + budgetAdjustment + skillAdjustment,
    }
  })
  ranked.sort((a, b) => b.score - a.score || b.fitScore - a.fitScore || a.name.localeCompare(b.name))
  return ranked
}

/** Maximum shortlist: one pick plus up to six alternatives. */
export const QUIZ_RESULT_COUNT = 7

/** Alternatives under the top pick. The few-options line shows when fewer qualify. */
export const QUIZ_ALTERNATIVE_COUNT = QUIZ_RESULT_COUNT - 1

/** Tools below this editorial fit are not shown on the quiz result. */
export const MIN_QUIZ_FIT_SCORE = 50

export type BudgetFit = 'within' | 'over' | 'unknown'

/**
 * A tool is inside the budget when the user can start it without crossing
 * the budget they chose. "Any" accepts every tool. "Free" uses the free-tier
 * flag. "Low" also accepts a known paid price at or under $30. A missing
 * price is unknown, not over budget.
 */
export function quizBudgetFit(
  tool: Pick<ScoreableTool, 'pricingModel' | 'hasFreeTier' | 'priceFromUsd'>,
  budget: RankBudget,
): BudgetFit {
  if (budget === 'any') return 'within'
  const freeToStart = tool.pricingModel === 'free' || tool.hasFreeTier
  if (freeToStart) return 'within'
  if (budget === 'free') return 'over'
  if (tool.priceFromUsd == null) return 'unknown'
  const cap = paidCap(budget) ?? LOW_BUDGET_USD
  return tool.priceFromUsd <= cap ? 'within' : 'over'
}

export function fitsBudget(
  tool: Pick<ScoreableTool, 'pricingModel' | 'hasFreeTier' | 'priceFromUsd'>,
  budget: RankBudget,
): boolean {
  return quizBudgetFit(tool, budget) === 'within'
}

export type QuizPick<T extends ScoreableTool> = T &
  Pick<RankedTool, 'score' | 'budgetDelta' | 'skillDelta'> & {
    budgetFit: BudgetFit
    /** One-line editorial reason. The fit note is already a single sentence. */
    reason: string
  }

/**
 * Keep tools that clear the minimum fit, rank them by fit plus the budget and
 * skill adjustments, and return at most one pick and six alternatives.
 * A tool just over budget can appear only when it clears that minimum.
 * The list is not padded when fewer tools qualify.
 */
export function selectQuizPicks<T extends ScoreableTool>(
  tools: T[],
  answers: { budget: RankBudget; skill: Skill },
): QuizPick<T>[] {
  const qualified = tools.filter(isQuizMatchable)
  return rankTools(qualified, answers)
    .slice(0, QUIZ_RESULT_COUNT)
    .map((tool) => ({
      ...tool,
      budgetFit: quizBudgetFit(tool, answers.budget),
      reason: tool.notes,
    }))
}

export function explainPick(pick: RankedTool, answers: { budget: RankBudget; skill: Skill }): string {
  const parts = [pick.notes]
  if (answers.budget === 'free') {
    parts.push(
      pick.hasFreeTier
        ? 'A free tier is available, which fits a free-only budget.'
        : 'There is no free tier, so it ranks lower when the budget is free only.',
    )
  } else if (answers.budget === 'low') {
    parts.push(
      pick.hasFreeTier || pick.pricingModel === 'free'
        ? 'You can start without a paid plan and upgrade only if you need more.'
        : 'This is a paid product, so it ranks lower on a low budget.',
    )
  }
  const gap = Math.abs(SKILL_RANK[pick.skillLevel] - SKILL_RANK[answers.skill])
  if (gap === 0) {
    parts.push(`The usual learning curve matches a ${skillLabel[answers.skill].toLowerCase()} user.`)
  } else if (gap === 2) {
    parts.push(`The usual learning curve is a step away from a ${skillLabel[answers.skill].toLowerCase()} user.`)
  }
  return parts.join(' ')
}
