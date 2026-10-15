import { describe, expect, it } from 'vitest'
import { budgetDelta, rankTools, skillDelta, type ScoreableTool } from './scoring'

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

  it('ignores an affiliate URL even if one is attached to the object', () => {
    const plain = tool()
    const withAffiliate = { ...tool({ slug: 'beta', name: 'Beta' }), affiliateUrl: 'https://example.com/aff?code=1' }
    const ranked = rankTools([plain, withAffiliate], { budget: 'any', skill: 'beginner' })
    expect(ranked[0]?.score).toBe(ranked[1]?.score)
    expect(ranked.map((item) => item.slug).sort()).toEqual(['alpha', 'beta'])
  })
})
