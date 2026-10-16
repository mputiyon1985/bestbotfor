import { describe, expect, it } from 'vitest'
import { budgetDelta, fitsBudget, MIN_QUIZ_FIT_SCORE, QUIZ_ALTERNATIVE_COUNT, QUIZ_RESULT_COUNT, quizBudgetFit, rankTools, selectQuizPicks, skillDelta, type ScoreableTool } from './scoring'

function tool(overrides: Partial<ScoreableTool> = {}): ScoreableTool {
  return {
    slug: 'alpha',
    name: 'Alpha',
    skillLevel: 'beginner',
    pricingModel: 'freemium',
    hasFreeTier: true,
    priceFromUsd: null,
    fitScore: 80,
    notes: 'A solid fit.',
    ...overrides,
  }
}

describe('rankTools', () => {
  it('keeps a strong editorial fit ahead of a weak free tool', () => {
    const ranked = rankTools(
      [
        tool({ slug: 'specialist', name: 'Specialist', fitScore: 92, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 20 }),
        tool({ slug: 'freebie', name: 'Freebie', fitScore: 40, pricingModel: 'free', hasFreeTier: true }),
      ],
      { budget: 'free', skill: 'beginner' },
    )
    expect(ranked[0]?.slug).toBe('specialist')
    expect(ranked[0]?.score).toBe(92 + budgetDelta(ranked[0]!, 'free') + skillDelta('beginner', 'beginner'))
  })

  it('lifts a free tier when the budget is free and the fit is close', () => {
    const ranked = rankTools(
      [
        tool({ slug: 'paid', name: 'Paid', fitScore: 80, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 40 }),
        tool({ slug: 'free', name: 'Free', fitScore: 70, pricingModel: 'free', hasFreeTier: true }),
      ],
      { budget: 'free', skill: 'beginner' },
    )
    expect(ranked.map((item) => item.slug)).toEqual(['free', 'paid'])
  })

  it('penalizes a large skill gap', () => {
    expect(skillDelta('pro', 'beginner')).toBe(-18)
    expect(skillDelta('beginner', 'beginner')).toBe(12)
  })

  it('shows at most one pick and six alternatives that clear the minimum fit', () => {
    const tools = [
      tool({ slug: 'free-a', name: 'Free A', fitScore: 90, pricingModel: 'free', hasFreeTier: true, priceFromUsd: null }),
      tool({ slug: 'free-b', name: 'Free B', fitScore: 70, pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 10, notes: 'Free B starts on a free tier.' }),
      tool({ slug: 'paid-high', name: 'Paid High', fitScore: 99, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 80, notes: 'Paid High is the strongest specialist.' }),
      tool({ slug: 'paid-mid', name: 'Paid Mid', fitScore: 88, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 40 }),
      tool({ slug: 'low-price', name: 'Low Price', fitScore: 60, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 20, notes: 'Low Price stays under a low budget.' }),
      tool({ slug: 'extra', name: 'Extra', fitScore: 55, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 25, notes: 'Extra stays inside a low budget.' }),
      tool({ slug: 'tail', name: 'Tail', fitScore: 51, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 200, notes: 'Tail is the last tool that still clears the minimum.' }),
      tool({ slug: 'paid-c', name: 'Paid C', fitScore: 50, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 100 }),
      tool({ slug: 'paid-d', name: 'Paid D', fitScore: 40, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 100 }),
      tool({ slug: 'paid-e', name: 'Paid E', fitScore: 30, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null }),
    ]

    const free = selectQuizPicks(tools, { budget: 'free', skill: 'beginner' })
    expect(MIN_QUIZ_FIT_SCORE).toBe(50)
    expect(QUIZ_RESULT_COUNT).toBe(7)
    expect(QUIZ_ALTERNATIVE_COUNT).toBe(6)
    expect(free).toHaveLength(QUIZ_RESULT_COUNT)
    expect(free.slice(1)).toHaveLength(QUIZ_ALTERNATIVE_COUNT)
    expect(free.map((pick) => pick.slug)).toEqual(['free-a', 'free-b', 'paid-high', 'paid-mid', 'low-price', 'extra', 'tail'])
    expect(free.some((pick) => pick.slug === 'paid-c')).toBe(false)
    expect(free.filter((pick) => pick.budgetFit === 'over').map((pick) => pick.slug)).toEqual([
      'paid-high',
      'paid-mid',
      'low-price',
      'extra',
      'tail',
    ])
    expect(free.every((pick) => pick.fitScore >= MIN_QUIZ_FIT_SCORE)).toBe(true)
    expect(free.every((pick) => pick.reason === pick.notes && !pick.reason.includes('\n'))).toBe(true)
    expect(fitsBudget(tools[4]!, 'low')).toBe(true)
    expect(fitsBudget(tools[4]!, 'free')).toBe(false)

    const low = selectQuizPicks(tools, { budget: 'low', skill: 'beginner' })
    expect(low.map((pick) => pick.slug)).toEqual(['free-a', 'paid-high', 'free-b', 'paid-mid', 'low-price', 'extra', 'tail'])
    expect(low.find((pick) => pick.slug === 'paid-high')?.budgetFit).toBe('over')
    expect(low.find((pick) => pick.slug === 'low-price')?.budgetFit).toBe('within')
    expect(low.find((pick) => pick.slug === 'extra')?.budgetFit).toBe('within')
    expect(low.find((pick) => pick.slug === 'tail')?.budgetFit).toBe('over')

    const any = selectQuizPicks(tools, { budget: 'any', skill: 'beginner' })
    expect(any.every((pick) => pick.budgetFit === 'within')).toBe(true)
    expect(any.map((pick) => pick.slug)).toEqual(['paid-high', 'free-a', 'paid-mid', 'free-b', 'low-price', 'extra', 'tail'])
  })

  it('treats a missing paid price as unknown on a low budget', () => {
    const unknown = tool({
      slug: 'unknown-price',
      name: 'Unknown Price',
      pricingModel: 'paid',
      hasFreeTier: false,
      priceFromUsd: null,
      fitScore: 80,
      notes: 'The paid entry price was not on the pricing page.',
    })
    expect(quizBudgetFit(unknown, 'low')).toBe('unknown')
    expect(budgetDelta(unknown, 'low')).toBe(0)
    expect(quizBudgetFit(unknown, 'free')).toBe('over')
    expect(fitsBudget(tool({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 16.99 }), 'low')).toBe(true)
    const picks = selectQuizPicks([unknown], { budget: 'low', skill: 'beginner' })
    expect(picks[0]?.budgetFit).toBe('unknown')
  })

  it('does not pad the shortlist when fewer than six alternatives clear the minimum', () => {
    const picks = selectQuizPicks(
      [
        tool({ slug: 'only', name: 'Only', fitScore: 70, pricingModel: 'free', hasFreeTier: true }),
        tool({ slug: 'second', name: 'Second', fitScore: 55, pricingModel: 'free', hasFreeTier: true }),
        tool({ slug: 'below', name: 'Below', fitScore: 49, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 80 }),
        tool({ slug: 'weaker', name: 'Weaker', fitScore: 20, pricingModel: 'free', hasFreeTier: true }),
      ],
      { budget: 'free', skill: 'beginner' },
    )
    expect(picks.map((pick) => pick.slug)).toEqual(['only', 'second'])
    expect(picks.every((pick) => pick.budgetFit === 'within')).toBe(true)
  })

  it('ignores an affiliate URL even if one is attached to the object', () => {
    const plain = tool()
    const withAffiliate = { ...tool({ slug: 'beta', name: 'Beta' }), affiliateUrl: 'https://example.com/aff?code=1' }
    const ranked = rankTools([plain, withAffiliate], { budget: 'any', skill: 'beginner' })
    expect(ranked[0]?.score).toBe(ranked[1]?.score)
    expect(ranked.map((item) => item.slug).sort()).toEqual(['alpha', 'beta'])
  })
})
