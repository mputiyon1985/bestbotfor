import { describe, expect, it } from 'vitest'
import { budgetDelta, fitsBudget, QUIZ_RESULT_COUNT, rankTools, selectQuizPicks, skillDelta, type ScoreableTool } from './scoring'

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

  it('returns one top pick and five alternatives, backfilling tools just over budget', () => {
    const tools = [
      tool({ slug: 'free-a', name: 'Free A', fitScore: 90, pricingModel: 'free', hasFreeTier: true, priceFromUsd: null }),
      tool({ slug: 'free-b', name: 'Free B', fitScore: 70, pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 10, notes: 'Free B starts on a free tier.' }),
      tool({ slug: 'paid-high', name: 'Paid High', fitScore: 99, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 80, notes: 'Paid High is the strongest specialist.' }),
      tool({ slug: 'paid-mid', name: 'Paid Mid', fitScore: 88, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 40 }),
      tool({ slug: 'low-price', name: 'Low Price', fitScore: 60, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 20, notes: 'Low Price stays under a low budget.' }),
      tool({ slug: 'paid-c', name: 'Paid C', fitScore: 50, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 100 }),
      tool({ slug: 'paid-d', name: 'Paid D', fitScore: 40, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 100 }),
      tool({ slug: 'paid-e', name: 'Paid E', fitScore: 30, pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null }),
    ]

    const free = selectQuizPicks(tools, { budget: 'free', skill: 'beginner' })
    expect(free).toHaveLength(QUIZ_RESULT_COUNT)
    expect(free[0]?.slug).toBe('free-a')
    expect(free.filter((pick) => pick.budgetFit === 'within').map((pick) => pick.slug)).toEqual(['free-a', 'free-b'])
    expect(free.filter((pick) => pick.budgetFit === 'over').map((pick) => pick.slug)).toEqual([
      'paid-high',
      'paid-mid',
      'low-price',
      'paid-c',
    ])
    expect(free.every((pick) => pick.reason === pick.notes && !pick.reason.includes('\n'))).toBe(true)

    const low = selectQuizPicks(tools, { budget: 'low', skill: 'beginner' })
    expect(low).toHaveLength(QUIZ_RESULT_COUNT)
    expect(low.filter((pick) => pick.budgetFit === 'within').map((pick) => pick.slug)).toEqual(['free-a', 'free-b', 'low-price'])
    expect(low.filter((pick) => pick.budgetFit === 'over').map((pick) => pick.slug)).toEqual(['paid-high', 'paid-mid', 'paid-c'])
    expect(fitsBudget(tools[4]!, 'low')).toBe(true)
    expect(fitsBudget(tools[4]!, 'free')).toBe(false)

    const any = selectQuizPicks(tools, { budget: 'any', skill: 'beginner' })
    expect(any).toHaveLength(QUIZ_RESULT_COUNT)
    expect(any.every((pick) => pick.budgetFit === 'within')).toBe(true)
    expect(any.map((pick) => pick.slug)).toEqual(['paid-high', 'free-a', 'paid-mid', 'free-b', 'low-price', 'paid-c'])
  })

  it('ignores an affiliate URL even if one is attached to the object', () => {
    const plain = tool()
    const withAffiliate = { ...tool({ slug: 'beta', name: 'Beta' }), affiliateUrl: 'https://example.com/aff?code=1' }
    const ranked = rankTools([plain, withAffiliate], { budget: 'any', skill: 'beginner' })
    expect(ranked[0]?.score).toBe(ranked[1]?.score)
    expect(ranked.map((item) => item.slug).sort()).toEqual(['alpha', 'beta'])
  })
})
