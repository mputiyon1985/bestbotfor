import { describe, expect, it } from 'vitest'
import { editorialRowsFromCsv, editorialSeeds } from '@/data/scores-pros-cons.seed'
import { toolSeeds } from '@/data/catalog'
import { softwareJsonLd } from './jsonld'
import type { CatalogTool } from './catalog-types'
import { HOW_WE_SCORE, SCORE_WEIGHTS, UNRATED_SLUGS, overallScore, ratingAriaLabel, starFills, validateEditorialSeeds } from './editorial'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { recommend } from './recommend'

const slugs = new Set(toolSeeds.map((tool) => tool.slug))

describe('BestBotFor score', () => {
  it('weights the four parts and rounds half up to one decimal', () => {
    expect(SCORE_WEIGHTS.features + SCORE_WEIGHTS.value + SCORE_WEIGHTS.ease + SCORE_WEIGHTS.quality).toBe(100)
    expect(overallScore({ features: 4, value: 4, ease: 5, quality: 4 })).toBe(4.3)
    expect(overallScore({ features: 4, value: 4, ease: 4, quality: 4 })).toBe(4)
    expect(overallScore({ features: 4, value: 3, ease: 3, quality: 4 })).toBe(3.5)
    expect(HOW_WE_SCORE).toContain('25%')
    expect(HOW_WE_SCORE).toContain('equally')
    expect(HOW_WE_SCORE).toContain('not a user review')
  })

  it('fills four stars and 30% of the fifth for 4.3', () => {
    expect(starFills(4.3)).toEqual([1, 1, 1, 1, 0.3])
    expect(starFills(4.2)).toEqual([1, 1, 1, 1, 0.2])
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0])
    expect(starFills(5)).toEqual([1, 1, 1, 1, 1])
    expect(starFills(5.4)).toEqual([1, 1, 1, 1, 1])
    expect(starFills(-1)).toEqual([0, 0, 0, 0, 0])
  })

  it('builds the accessible name from the rounded score', () => {
    expect(ratingAriaLabel(4.3)).toBe('Rated 4.3 out of 5')
    expect(ratingAriaLabel(4)).toBe('Rated 4 out of 5')
    expect(ratingAriaLabel(3.6)).toBe('Rated 3.6 out of 5')
    expect(ratingAriaLabel(0)).toBe('Rated 0 out of 5')
  })

  it('accepts the checked seed and rejects invented or incomplete rows', () => {
    expect(editorialSeeds).toHaveLength(146)
    expect(toolSeeds).toHaveLength(159)
    const rated = new Set(editorialSeeds.map((row) => row.slug))
    expect([...slugs].filter((slug) => !rated.has(slug)).sort()).toEqual([...UNRATED_SLUGS].sort())
    expect(JSON.stringify(editorialSeeds)).not.toContain('pcmag.com')
    expect(JSON.stringify(editorialSeeds)).not.toContain('third_party')
    const blocked = new Set(toolSeeds.filter((tool) => tool.needsVerification).map((tool) => tool.slug))
    expect(blocked).toEqual(new Set(['windsurf']))
    expect(() => validateEditorialSeeds(editorialSeeds, slugs, blocked)).not.toThrow()
    for (const row of editorialSeeds) {
      expect(row.overall).toBe(overallScore(row))
      expect(row.pros).toHaveLength(3)
      expect(row.cons.length).toBeGreaterThanOrEqual(2)
      expect(row.cons.length).toBeLessThanOrEqual(3)
      expect(row.pros.every((point) => point.sourceUrl.startsWith('https://'))).toBe(true)
      expect(row.cons.every((point) => point.sourceUrl.startsWith('https://'))).toBe(true)
      expect(UNRATED_SLUGS).not.toContain(row.slug)
    }
    const claude = editorialSeeds.find((row) => row.slug === 'claude')
    expect(claude?.pros.every((point) => point.sourceUrl === 'https://claude.com/pricing')).toBe(true)
    const loaded = editorialRowsFromCsv(
      'slug,features,value,ease,quality,overall,rationale,pro1,pro1_source,pro2,pro2_source,pro3,pro3_source,con1,con1_source,con2,con2_source,con3,con3_source,third_party_sources,source_urls,reviewed_at,batch\n' +
        'claude,4.0,4.0,4.0,4.0,4.0,A rationale long enough to pass the editorial check.,First pro text here,https://claude.com/pricing,Second pro text here,https://claude.com/pricing,Third pro text here,https://claude.com/pricing,First con text here,https://claude.com/pricing,Second con text here,https://claude.com/pricing,,,https://www.pcmag.com/picks/the-best-ai-chatbots,https://claude.com/pricing https://www.pcmag.com/picks/the-best-ai-chatbots,2026-10-16,6\n',
    )
    expect(loaded).toHaveLength(1)
    expect(JSON.stringify(loaded)).not.toContain('pcmag.com')
    expect(() => validateEditorialSeeds(loaded, slugs, blocked)).not.toThrow()
    expect(() => validateEditorialSeeds([{ ...loaded[0]!, slug: 'windsurf' }], slugs, blocked)).toThrow(/needs verification/)

    const base = editorialSeeds[0]
    expect(base).toBeTruthy()
    if (!base) return
    expect(() => validateEditorialSeeds([{ ...base, overall: 1 }], slugs)).toThrow(/equal-weight average/)
    expect(() => validateEditorialSeeds([{ ...base, slug: 'not-a-tool' }], slugs)).toThrow(/unknown tool/)
    expect(() => validateEditorialSeeds([{ ...base, pros: base.pros.slice(0, 2) }], slugs)).toThrow(/pros/)
    expect(() => validateEditorialSeeds([{ ...base, cons: base.cons.slice(0, 1) }], slugs)).toThrow(/cons/)
    expect(() =>
      validateEditorialSeeds([{ ...base, pros: base.pros.map((point) => ({ ...point, sourceUrl: 'http://example.com' })) }], slugs),
    ).toThrow(/https/)
    expect(() => validateEditorialSeeds([base, base], slugs)).toThrow(/repeats/)
  })

  it('does not emit AggregateRating or Review schema for an editorial score', () => {
    const scored = editorialSeeds.find((row) => row.slug === 'claude')
    expect(scored).toBeTruthy()
    if (!scored) return
    const tool = {
      id: 1,
      slug: 'claude',
      name: 'Claude',
      vendor: 'Anthropic',
      url: 'https://claude.ai',
      category: 'Chat assistant',
      shortDesc: 'A chat assistant.',
      longDesc: 'A longer description of the assistant.',
      pricingModel: 'freemium',
      priceFromUsd: null,
      hasFreeTier: true,
      skillLevel: 'beginner',
      platforms: ['Web'],
      lastVerifiedAt: '2026-10-16',
      fits: [],
      affiliate: {
        hasProgram: false,
        network: null,
        sourceUrl: null,
        status: 'none',
        commissionNote: null,
        affiliateUrl: null,
      },
      editorial: {
        features: scored.features,
        value: scored.value,
        ease: scored.ease,
        quality: scored.quality,
        overall: scored.overall,
        rationale: scored.rationale,
        reviewedAt: scored.reviewedAt,
      },
      pros: scored.pros.map((point) => ({ kind: 'pro' as const, text: point.text, sourceUrl: point.sourceUrl })),
      cons: scored.cons.map((point) => ({ kind: 'con' as const, text: point.text, sourceUrl: point.sourceUrl })),
    } satisfies CatalogTool
    const json = softwareJsonLd(tool)
    const serialized = JSON.stringify(json)
    expect(json).not.toHaveProperty('aggregateRating')
    expect(json).not.toHaveProperty('review')
    expect(serialized).not.toContain('AggregateRating')
    expect(serialized).not.toContain('Review')
    expect(serialized).not.toContain('ratingValue')
    expect(serialized).not.toContain('pcmag.com')
    expect(serialized).not.toContain('claude.com/pricing')
  })

  it('hides scores for blank tools and keeps a free-budget quiz working without a retired free plan', () => {
    const windsurf = toolSeeds.find((tool) => tool.slug === 'windsurf')
    expect(windsurf?.name).toBe('Windsurf')
    expect(windsurf?.needsVerification).toBe(true)
    const relevance = toolSeeds.find((tool) => tool.slug === 'relevance-ai')
    expect(relevance?.hasFreeTier).toBe(false)
    expect(relevance?.pricingModel).toBe('paid')

    const catalog = catalogFromSeeds()
    for (const slug of UNRATED_SLUGS) {
      const tool = catalog.tools.find((item) => item.slug === slug)
      expect(tool?.editorial, slug).toBeNull()
      expect(tool?.pros, slug).toEqual([])
      expect(tool?.cons, slug).toEqual([])
    }
    expect(catalog.tools.find((tool) => tool.slug === 'windsurf')?.name).toBe('Windsurf')

    const freeAgents = recommend(catalog, { task: 'agents', budget: 'free', skill: 'beginner' })
    expect(freeAgents?.picks.length).toBeGreaterThan(0)
    const retired = freeAgents?.picks.find((pick) => pick.slug === 'relevance-ai')
    if (retired) expect(retired.budgetFit).toBe('over')
    expect(freeAgents?.picks.some((pick) => pick.budgetFit === 'within' && pick.hasFreeTier)).toBe(true)

    const chat = recommend(catalog, { task: 'chat', budget: 'any', skill: 'beginner' })
    const grok = chat?.picks.find((pick) => pick.slug === 'grok')
    expect(grok?.tool.editorial).toBeNull()
    expect(grok?.tool.pros).toEqual([])
    expect(chat?.picks.some((pick) => pick.tool.editorial)).toBe(true)
  })
})
