import { describe, expect, it } from 'vitest'
import { editorialRowsFromCsv, editorialSeeds } from '@/data/scores-pros-cons.seed'
import { toolSeeds } from '@/data/catalog'
import { softwareJsonLd } from './jsonld'
import type { CatalogTool } from './catalog-types'
import { HOW_WE_SCORE, SCORE_WEIGHTS, overallScore, ratingAriaLabel, starFills, validateEditorialSeeds } from './editorial'

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
    expect(editorialSeeds).toHaveLength(13)
    expect(editorialSeeds.map((row) => row.slug).sort()).toEqual([
      'chatgpt',
      'claude',
      'elevenlabs',
      'framer',
      'inworld',
      'lovable',
      'make',
      'midjourney',
      'otter',
      'runway',
      'suno',
      'supabase',
      'surfer',
    ])
    expect(() => validateEditorialSeeds(editorialSeeds, slugs)).not.toThrow()
    for (const row of editorialSeeds) {
      expect(row.overall).toBe(overallScore(row))
      expect(row.pros).toHaveLength(3)
      expect(row.cons.length).toBeGreaterThanOrEqual(2)
      expect(row.cons.length).toBeLessThanOrEqual(3)
      expect(row.sources.every((source) => source.startsWith('https://'))).toBe(true)
      expect(row.pros.every((point) => point.sourceUrl.startsWith('https://'))).toBe(true)
      expect(row.cons.every((point) => point.sourceUrl.startsWith('https://'))).toBe(true)
    }
    const claude = editorialSeeds.find((row) => row.slug === 'claude')
    expect(claude?.sources.some((source) => source.includes('pcmag.com'))).toBe(true)
    expect(claude?.pros.every((point) => !point.sourceUrl.includes('pcmag.com'))).toBe(true)
    expect(() =>
      editorialRowsFromCsv(
        'slug,features,value,ease,quality,overall,rationale,pro1,pro1_source,pro2,pro2_source,pro3,pro3_source,con1,con1_source,con2,con2_source,con3,con3_source,source_urls,reviewed_at,batch\n' +
          'claude,4.0,4.0,4.0,4.0,4.0,A rationale long enough to pass the editorial check.,First pro text here,https://claude.com/pricing,Second pro text here,https://claude.com/pricing,Third pro text here,https://claude.com/pricing,First con text here,https://claude.com/pricing,Second con text here,https://claude.com/pricing,,,https://claude.com/pricing,2026-10-16,2\n',
      ),
    ).toThrow(/no rows for batch 1/)

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
  })
})
