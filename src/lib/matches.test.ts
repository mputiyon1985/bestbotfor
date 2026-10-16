import { describe, expect, it } from 'vitest'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { itemListJsonLd } from './jsonld'
import { recommend } from './recommend'
import { quizBudgetFit, type ScoreableTool } from './scoring'
import {
  MATCHES_PAGE_SIZE,
  listMatches,
  matchesPageRequest,
  matchesPath,
  pageOfMatches,
  seeAllMatchesLabel,
} from './matches'

function candidates(task: string): ScoreableTool[] {
  return catalogFromSeeds().tools.flatMap((tool) => {
    const fit = tool.fits.find((item) => item.taskSlug === task)
    if (!fit) return []
    return [
      {
        slug: tool.slug,
        name: tool.name,
        skillLevel: tool.skillLevel,
        pricingModel: tool.pricingModel,
        hasFreeTier: tool.hasFreeTier,
        priceFromUsd: tool.priceFromUsd,
        fitScore: fit.score,
        notes: fit.notes,
        quizEligible: tool.quizEligible,
      },
    ]
  })
}

describe('all matches', () => {
  it('pages every qualified tool six at a time in rank order', () => {
    const matches = listMatches(candidates('coding'), 'any')
    expect(matches.length).toBeGreaterThan(MATCHES_PAGE_SIZE)
    expect(pageOfMatches(matches, 1)).toHaveLength(MATCHES_PAGE_SIZE)
    expect(pageOfMatches(matches, 2).map((tool) => tool.slug)).toEqual(
      matches.slice(MATCHES_PAGE_SIZE, MATCHES_PAGE_SIZE * 2).map((tool) => tool.slug),
    )
    expect(pageOfMatches(matches, 1).some((tool) => tool.slug === pageOfMatches(matches, 2)[0]?.slug)).toBe(false)
    expect(matches.every((tool) => tool.fitScore >= 50 && tool.reason === tool.notes)).toBe(true)
    const shortlist = recommend(catalogFromSeeds(), { task: 'coding', budget: 'any', skill: 'beginner' })
    expect(pageOfMatches(matches, 1).map((tool) => tool.slug)).toEqual(shortlist?.picks.slice(0, MATCHES_PAGE_SIZE).map((tool) => tool.slug))
  })

  it('keeps SOUNDRAW on a low-budget page and drops it from free', () => {
    const low = listMatches(candidates('music'), 'low')
    const free = listMatches(candidates('music'), 'free')
    expect(low.some((tool) => tool.slug === 'soundraw' && tool.budgetFit === 'within')).toBe(true)
    expect(free.some((tool) => tool.slug === 'soundraw')).toBe(false)
    expect(seeAllMatchesLabel(low.length)).toBe(`See all ${low.length} matches`)
  })

  it('keeps a known low price and drops a quiz-ineligible tool', () => {
    const priced = {
      slug: 'sample',
      name: 'Sample',
      skillLevel: 'beginner' as const,
      pricingModel: 'paid' as const,
      hasFreeTier: false,
      fitScore: 80,
      notes: 'A priced plan with a known monthly entry price.',
    }
    expect(quizBudgetFit({ ...priced, priceFromUsd: 16.99 }, 'low')).toBe('within')
    expect(quizBudgetFit({ ...priced, hasFreeTier: true, priceFromUsd: 139 }, 'low')).toBe('within')
    const coding = listMatches(candidates('coding'), 'any')
    expect(coding.some((tool) => tool.slug === 'roo-code')).toBe(false)
    expect(pageOfMatches(coding, 2).some((tool) => tool.slug === 'roo-code')).toBe(false)
    const agents = listMatches(candidates('agents'), 'any')
    const automation = listMatches(candidates('automation'), 'any')
    expect(agents.some((tool) => tool.slug === 'flowise')).toBe(false)
    expect(pageOfMatches(agents, 1).some((tool) => tool.slug === 'flowise')).toBe(false)
    expect(automation.some((tool) => tool.slug === 'flowise')).toBe(false)
    expect(pageOfMatches(automation, 3).some((tool) => tool.slug === 'flowise')).toBe(false)
    const listed = JSON.stringify(itemListJsonLd('Matches for agents', matchesPath('agents', 'any', 1), pageOfMatches(agents, 1)))
    expect(listed).not.toContain('/tools/flowise')
    expect(listed).not.toContain('Flowise')
    expect(catalogFromSeeds().tools.find((tool) => tool.slug === 'flowise')?.quizEligible).toBe(false)
    expect(catalogFromSeeds().tools.find((tool) => tool.slug === 'roo-code')?.quizEligible).toBe(false)
  })

  it('builds page URLs that keep the budget and rejects pages that do not exist', () => {
    expect(matchesPath('music', 'any', 1)).toBe('/result?task=music&view=all')
    expect(matchesPath('music', 'low', 1)).toBe('/result?task=music&view=all&budget=low')
    expect(matchesPath('music', 'low', 2)).toBe('/result?task=music&view=all&budget=low&page=2')
    expect(matchesPath('music', 'free', 3)).toBe('/result?task=music&view=all&budget=free&page=3')
    const total = listMatches(candidates('coding'), 'any').length
    expect(matchesPageRequest('', total)?.page).toBe(1)
    expect(matchesPageRequest('2', total)?.page).toBe(2)
    expect(matchesPageRequest('1', total)?.page).toBe(1)
    expect(matchesPageRequest('0', total)).toBeNull()
    expect(matchesPageRequest('-1', total)).toBeNull()
    expect(matchesPageRequest('abc', total)).toBeNull()
    expect(matchesPageRequest('01', total)).toBeNull()
    expect(matchesPageRequest('99', total)).toBeNull()
    expect(matchesPageRequest(String(Math.ceil(total / MATCHES_PAGE_SIZE) + 1), total)).toBeNull()
  })
})
