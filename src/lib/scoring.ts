import { skillLabel } from './format'
import type { Budget, Skill } from './validation'

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
}

export type RankedTool = ScoreableTool & {
  score: number
  budgetDelta: number
  skillDelta: number
}

const LOW_BUDGET_USD = 30

export function budgetDelta(tool: Pick<ScoreableTool, 'pricingModel' | 'hasFreeTier' | 'priceFromUsd'>, budget: Budget): number {
  if (budget === 'any') return 0
  if (budget === 'free') {
    if (tool.pricingModel === 'free') return 18
    if (tool.hasFreeTier) return 10
    return -30
  }
  if (tool.pricingModel === 'free' || tool.hasFreeTier) {
    if (tool.priceFromUsd != null && tool.priceFromUsd > LOW_BUDGET_USD) return 4
    return 12
  }
  if (tool.priceFromUsd != null && tool.priceFromUsd <= LOW_BUDGET_USD) return 8
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
  answers: { budget: Budget; skill: Skill },
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

/** One top pick plus five alternatives. */
export const QUIZ_RESULT_COUNT = 6

export type BudgetFit = 'within' | 'over'

/**
 * A tool is inside the budget when the user can start it without crossing
 * the budget they chose. "Any" accepts every tool. "Free" needs a free plan
 * or a free tier. "Low" also accepts a paid plan at or under $30.
 */
export function fitsBudget(
  tool: Pick<ScoreableTool, 'pricingModel' | 'hasFreeTier' | 'priceFromUsd'>,
  budget: Budget,
): boolean {
  if (budget === 'any') return true
  const freeToStart = tool.pricingModel === 'free' || tool.hasFreeTier
  if (budget === 'free') return freeToStart
  if (freeToStart) return true
  return tool.priceFromUsd != null && tool.priceFromUsd <= LOW_BUDGET_USD
}

export type QuizPick<T extends ScoreableTool> = T &
  Pick<RankedTool, 'score' | 'budgetDelta' | 'skillDelta'> & {
    budgetFit: BudgetFit
    /** One-line editorial reason. The fit note is already a single sentence. */
    reason: string
  }

/**
 * Rank tools that fit the budget by fit score plus the budget and skill
 * adjustments. When that list has fewer than five alternatives, append the
 * best-fitting tools just over budget, ordered by fit score.
 */
export function selectQuizPicks<T extends ScoreableTool>(
  tools: T[],
  answers: { budget: Budget; skill: Skill },
): QuizPick<T>[] {
  const within: T[] = []
  const over: T[] = []
  for (const tool of tools) {
    if (fitsBudget(tool, answers.budget)) within.push(tool)
    else over.push(tool)
  }
  const withinPicks: QuizPick<T>[] = rankTools(within, answers).map((tool) => ({
    ...tool,
    budgetFit: 'within',
    reason: tool.notes,
  }))
  const overPicks: QuizPick<T>[] = rankTools(over, answers)
    .sort((a, b) => b.fitScore - a.fitScore || a.name.localeCompare(b.name))
    .map((tool) => ({
      ...tool,
      budgetFit: 'over',
      reason: tool.notes,
    }))
  return [...withinPicks, ...overPicks].slice(0, QUIZ_RESULT_COUNT)
}

export function explainPick(pick: RankedTool, answers: { budget: Budget; skill: Skill }): string {
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
