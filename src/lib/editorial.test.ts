import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editorialRowsFromCsv, editorialSeeds } from '@/data/scores-pros-cons.seed'
import { keptProsConsSeeds, ratingSeeds, supplementalProsConsSeeds, unratedSlugs } from '@/data/scores-v23.seed'
import { toolSeeds } from '@/data/catalog'
import { softwareJsonLd } from './jsonld'
import type { CatalogTool } from './catalog-types'
import {
  SCORE_WEIGHTS,
  SINGLE_TOOL_CATEGORIES,
  UNMAINTAINED_NOTICE,
  categoryToolCounts,
  overallScore,
  ratingAriaLabel,
  starFills,
  validateEditorialSeeds,
  validateProsConsSeeds,
  validateRatingSeeds,
} from './editorial'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { recommend } from './recommend'
import { selectQuizPicks } from './scoring'

const slugs = new Set(toolSeeds.map((tool) => tool.slug))

describe('Our rating', () => {
  it('weights the four parts and rounds half up to one decimal', () => {
    expect(SCORE_WEIGHTS.quality + SCORE_WEIGHTS.features + SCORE_WEIGHTS.value + SCORE_WEIGHTS.ease).toBe(100)
    expect(SCORE_WEIGHTS).toEqual({ quality: 40, features: 25, value: 20, ease: 15 })
    expect(overallScore({ features: 4, value: 4, ease: 5, quality: 4 })).toBe(4.2)
    expect(overallScore({ features: 4, value: 4, ease: 4, quality: 4 })).toBe(4)
    expect(overallScore({ features: 4, value: 3, ease: 3, quality: 4 })).toBe(3.7)
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
    expect(ratingSeeds).toHaveLength(112)
    expect(unratedSlugs).toHaveLength(145)
    expect(ratingSeeds.find((row) => row.slug === 'grok')?.rationale).toBe('')
    expect(ratingSeeds.find((row) => row.slug === 'semantic-scholar')?.rationale).toBe('')
    expect(unratedSlugs).not.toContain('cursor')
    expect(unratedSlugs).not.toContain('windsurf')
    expect(unratedSlugs).not.toContain('perplexity')
    expect(unratedSlugs).toContain('se-ranking')
    expect(toolSeeds).toHaveLength(257)
    const rated = new Set(ratingSeeds.map((row) => row.slug))
    expect([...slugs].filter((slug) => !rated.has(slug)).sort()).toEqual([...unratedSlugs])
    expect(JSON.stringify(ratingSeeds)).not.toContain('pcmag.com')
    expect(JSON.stringify(ratingSeeds)).not.toContain('techradar.com')
    expect(JSON.stringify(ratingSeeds)).not.toContain('evidence.jsonl')
    expect(JSON.stringify(ratingSeeds)).not.toContain('http')
    expect(JSON.stringify(ratingSeeds)).not.toContain('third_party')
    expect(JSON.stringify(ratingSeeds)).not.toContain('source_urls')
    expect(JSON.stringify(editorialSeeds)).not.toContain('pcmag.com')
    expect(JSON.stringify(editorialSeeds)).not.toContain('third_party')
    expect(JSON.stringify(editorialSeeds)).not.toContain('source_urls')
    const blocked = new Set(toolSeeds.filter((tool) => tool.needsVerification).map((tool) => tool.slug))
    expect(blocked.size).toBe(0)
    expect(() => validateRatingSeeds(ratingSeeds, slugs)).not.toThrow()
    expect(() => validateProsConsSeeds(keptProsConsSeeds, slugs)).not.toThrow()
    for (const row of ratingSeeds) {
      expect(row.overall).toBe(overallScore(row))
      expect(unratedSlugs).not.toContain(row.slug)
    }
    const singles = [...categoryToolCounts(ratingSeeds).entries()]
      .filter(([, count]) => count === 1)
      .map(([category]) => category)
      .sort()
    expect(singles).toEqual([...SINGLE_TOOL_CATEGORIES].sort())
    const claude = keptProsConsSeeds.find((row) => row.slug === 'claude')
    expect(claude?.pros.every((point) => point.sourceUrl === 'https://claude.com/pricing')).toBe(true)
    const loaded = editorialRowsFromCsv(
      'slug,features,value,ease,quality,overall,rationale,pro1,pro1_source,pro2,pro2_source,pro3,pro3_source,con1,con1_source,con2,con2_source,con3,con3_source,third_party_sources,source_urls,reviewed_at,batch\n' +
        'claude,4.0,4.0,4.0,4.0,4.0,A rationale long enough to pass the editorial check.,First pro text here,https://claude.com/pricing,Second pro text here,https://claude.com/pricing,Third pro text here,https://claude.com/pricing,First con text here,https://claude.com/pricing,Second con text here,https://claude.com/pricing,,,https://www.pcmag.com/picks/the-best-ai-chatbots,https://claude.com/pricing https://www.pcmag.com/picks/the-best-ai-chatbots,2026-10-16,6\n',
    )
    expect(loaded).toHaveLength(1)
    expect(JSON.stringify(loaded)).not.toContain('pcmag.com')
    expect(() => validateEditorialSeeds(loaded, slugs, blocked)).not.toThrow()
    expect(() => validateEditorialSeeds([{ ...loaded[0]!, slug: 'windsurf' }], slugs, new Set(['windsurf']))).toThrow(
      /needs verification/,
    )

    const base = loaded[0]
    expect(base).toBeTruthy()
    if (!base) return
    expect(() => validateEditorialSeeds([{ ...base, overall: 1 }], slugs)).toThrow(/weighted average/)
    expect(() => validateEditorialSeeds([{ ...base, slug: 'not-a-tool' }], slugs)).toThrow(/unknown tool/)
    expect(() => validateEditorialSeeds([{ ...base, pros: base.pros.slice(0, 2) }], slugs)).toThrow(/pros/)
    expect(() => validateEditorialSeeds([{ ...base, cons: base.cons.slice(0, 1) }], slugs)).toThrow(/cons/)
    expect(() =>
      validateEditorialSeeds([{ ...base, pros: base.pros.map((point) => ({ ...point, sourceUrl: 'http://example.com' })) }], slugs),
    ).toThrow(/https/)
    expect(() => validateEditorialSeeds([base, base], slugs)).toThrow(/repeats/)
  })

  it('does not emit AggregateRating or Review schema for an editorial score', () => {
    const scored = ratingSeeds.find((row) => row.slug === 'claude')
    const points = keptProsConsSeeds.find((row) => row.slug === 'claude')
    expect(scored).toBeTruthy()
    expect(points).toBeTruthy()
    if (!scored || !points) return
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
        primaryCategory: scored.primaryCategory,
        categoryRankDisplay: scored.categoryRankDisplay,
        tieGroup: scored.tieGroup,
        tied: scored.tieGroup.length > 0,
        hideRank: false,
        note: scored.note,
        ratingStatus: scored.ratingStatus,
        quizEligible: scored.quizEligible,
      },
      pros: points.pros.map((point) => ({ kind: 'pro' as const, text: point.text, sourceUrl: point.sourceUrl })),
      cons: points.cons.map((point) => ({ kind: 'con' as const, text: point.text, sourceUrl: point.sourceUrl })),
      quizEligible: scored.quizEligible,
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
    expect(windsurf?.name).toBe('Devin Desktop (formerly Windsurf)')
    expect(windsurf?.vendor).toBe('Cognition')
    expect(windsurf?.url).toBe('https://devin.ai/desktop')
    expect(windsurf?.allowedHosts).toEqual(['devin.ai'])
    expect(windsurf?.priceFromUsd).toBe(20)
    expect(windsurf?.hasFreeTier).toBe(true)
    expect(windsurf?.needsVerification).toBeFalsy()
    expect(windsurf?.longDesc).not.toContain('https://devin.ai/pricing')
    expect(windsurf?.longDesc).toContain('The Free plan is $0 and Pro is $20 a month.')
    const cursor = toolSeeds.find((tool) => tool.slug === 'cursor')
    expect(cursor?.priceFromUsd).toBe(8)
    expect(cursor?.hasFreeTier).toBe(true)
    expect(cursor?.longDesc).toContain('Free $0')
    expect(cursor?.longDesc).toContain('Plus $8 (Grok models only)')
    expect(cursor?.longDesc).toContain('Premium $30 (third-party models billed extra)')
    expect(cursor?.longDesc).toContain('Pro $20 is for legacy subscribers only')
    const relevance = toolSeeds.find((tool) => tool.slug === 'relevance-ai')
    expect(relevance?.hasFreeTier).toBe(false)
    expect(relevance?.pricingModel).toBe('paid')
    expect(relevance?.priceFromUsd).toBe(19)
    expect(relevance?.longDesc).toContain('Pro is $19 a month billed yearly')

    const catalog = catalogFromSeeds()
    const unlisted = new Set(toolSeeds.filter((item) => item.unlisted).map((item) => item.slug))
    for (const slug of unratedSlugs.filter((item) => !unlisted.has(item))) {
      const tool = catalog.tools.find((item) => item.slug === slug)
      const v1 = editorialSeeds.find((row) => row.slug === slug)
      expect(tool?.editorial, slug).toBeNull()
      expect(tool?.pros.map((point) => point.text), slug).toEqual(v1?.pros.map((point) => point.text) ?? [])
      expect(tool?.cons.map((point) => point.text), slug).toEqual(v1?.cons.map((point) => point.text) ?? [])
      expect(tool?.quizEligible, slug).toBe(true)
    }
    const unratedWithPoints = catalog.tools.find((tool) => tool.slug === 'relevance-ai')
    expect(unratedWithPoints?.editorial).toBeNull()
    expect(unratedWithPoints?.pros.length).toBeGreaterThan(0)
    expect(unratedWithPoints?.cons.length).toBeGreaterThan(0)
    const ratedWindsurf = catalog.tools.find((tool) => tool.slug === 'windsurf')
    expect(ratedWindsurf?.name).toBe('Devin Desktop (formerly Windsurf)')
    expect(ratedWindsurf?.editorial?.overall).toBe(ratingSeeds.find((row) => row.slug === 'windsurf')?.overall)
    expect(ratedWindsurf?.pros.map((point) => point.text)).toEqual(supplementalProsConsSeeds.find((row) => row.slug === 'windsurf')?.pros.map((point) => point.text))
    expect(ratedWindsurf?.cons.map((point) => point.text)).toEqual(supplementalProsConsSeeds.find((row) => row.slug === 'windsurf')?.cons.map((point) => point.text))
    expect(ratedWindsurf?.editorial?.hideRank).toBe(false)
    expect(ratedWindsurf?.editorial?.categoryRankDisplay).toBe('#11 of 13 in Coding')
    expect(ratedWindsurf?.editorial?.tied).toBe(true)
    const ratedCursor = catalog.tools.find((tool) => tool.slug === 'cursor')
    expect(ratedCursor?.editorial?.categoryRankDisplay).toBe('#2 of 13 in Coding')
    expect(ratedCursor?.editorial?.tied).toBe(true)
    expect(ratedCursor?.pros.map((point) => point.text)).toEqual(supplementalProsConsSeeds.find((row) => row.slug === 'cursor')?.pros.map((point) => point.text))
    expect(ratedCursor?.cons.length).toBe(3)

    const gemini = catalog.tools.find((tool) => tool.slug === 'gemini')
    const grokTool = catalog.tools.find((tool) => tool.slug === 'grok')
    expect(gemini?.editorial?.tieGroup).toBe('chat-T2')
    expect(grokTool?.editorial?.tieGroup).toBe('chat-T2')
    expect(gemini?.editorial?.tied).toBe(true)
    expect(grokTool?.editorial?.tied).toBe(true)
    // Ratings backlog batch 02: Kimi (3.9) joins Claude (4.0) in tie group chat-T3
    expect(catalog.tools.find((tool) => tool.slug === 'claude')?.editorial?.tieGroup).toBe('chat-T3')
    expect(catalog.tools.find((tool) => tool.slug === 'claude')?.editorial?.tied).toBe(true)
    expect(catalog.tools.find((tool) => tool.slug === 'kimi')?.editorial?.categoryRankDisplay).toBe('#5 of 5 in Chat')

    for (const slug of ['supabase', 'inworld', 'craft']) {
      const tool = catalog.tools.find((item) => item.slug === slug)
      expect(tool?.editorial?.hideRank, slug).toBe(true)
      expect(tool?.editorial?.categoryRankDisplay, slug).toMatch(/#1 of 1 in /)
    }
    // 2026-10-22 quiz-pick ratings: Canva leads Design, Surfer is #3 in SEO.
    // Ratings backlog batch 02 (approved by James 2026-10-25): Consensus is the new Research #1 (3.9, quality tie-break
    // 4.0 vs 3.9, two independent quality sources) and Perplexity drops to #2 with its score unchanged.
    const rankOf = (slug: string) => catalog.tools.find((tool) => tool.slug === slug)?.editorial?.categoryRankDisplay
    expect(rankOf('consensus')).toBe('#1 of 8 in Research')
    expect(catalog.tools.find((tool) => tool.slug === 'consensus')?.editorial?.overall).toBe(3.9)
    expect(rankOf('perplexity')).toBe('#2 of 8 in Research')
    expect(rankOf('semantic-scholar')).toBe('#3 of 8 in Research')
    expect(rankOf('elicit')).toBe('#4 of 8 in Research')
    expect(rankOf('canva')).toBe('#1 of 2 in Design')
    expect(rankOf('beautiful-ai')).toBe('#2 of 2 in Design')
    expect(catalog.tools.find((tool) => tool.slug === 'beautiful-ai')?.editorial?.hideRank).toBe(false)
    expect(rankOf('ahrefs')).toBe('#1 of 3 in SEO')
    expect(rankOf('semrush')).toBe('#2 of 3 in SEO')
    expect(rankOf('surfer')).toBe('#3 of 3 in SEO')
    expect(catalog.tools.find((tool) => tool.slug === 'perplexity')?.editorial?.overall).toBe(3.9)
    expect(catalog.tools.find((tool) => tool.slug === 'canva')?.editorial?.overall).toBe(4)
    expect(catalog.tools.find((tool) => tool.slug === 'surfer')?.editorial?.overall).toBe(3.6)
    // perplexity.ai/pro shows only the annual-billed Pro price: $17, labeled 'billed annually' like krisp and tldv
    const perplexitySeed = toolSeeds.find((tool) => tool.slug === 'perplexity')
    expect(perplexitySeed?.priceFromUsd).toBe(17)
    expect(perplexitySeed?.longDesc).toContain('$17 a month, billed annually')
    const perplexityCsv = readFileSync(join(process.cwd(), 'src/data/scores-v2.3.csv'), 'utf8').split(/\r?\n/).find((line) => line.startsWith('perplexity,'))
    expect(perplexityCsv).toContain('Pro costs $17 a month billed annually')
    expect(perplexityCsv).not.toContain('$20')
    expect(catalog.tools.find((tool) => tool.slug === 'soundraw')?.editorial).toBeNull()
    expect(catalog.tools.find((tool) => tool.slug === 'soundraw')?.priceFromUsd).toBe(16.99)
    expect(catalog.tools.find((tool) => tool.slug === 'craft')?.category).toBe('Productivity')
    expect(catalog.tools.find((tool) => tool.slug === 'se-ranking')?.category).toBe('SEO')
    expect(toolSeeds.find((tool) => tool.slug === 'se-ranking')?.fits[0]?.task).toBe('seo')
    expect(toolSeeds.find((tool) => tool.slug === 'notebooklm')).toMatchObject({
      name: 'Gemini Notebook',
      url: 'https://notebooklm.google/plans',
      allowedHosts: ['notebooklm.google'],
    })

    const chatgpt = catalog.tools.find((tool) => tool.slug === 'chatgpt')
    expect(chatgpt?.editorial?.note).toBe('regular price not published; value neutral')
    const scholar = catalog.tools.find((tool) => tool.slug === 'semantic-scholar')
    expect(scholar?.editorial?.note).toContain('quality floor')

    const flowise = catalog.tools.find((tool) => tool.slug === 'flowise')
    const roo = catalog.tools.find((tool) => tool.slug === 'roo-code')
    expect(flowise?.editorial?.ratingStatus).toBe(UNMAINTAINED_NOTICE)
    expect(roo?.editorial?.ratingStatus).toBe(UNMAINTAINED_NOTICE)
    expect(flowise?.quizEligible).toBe(false)
    expect(roo?.quizEligible).toBe(false)

    const freeAgents = recommend(catalog, { task: 'agents', budget: 'free', skill: 'beginner' })
    expect(freeAgents?.picks.length).toBeGreaterThan(0)
    expect(freeAgents?.picks.some((pick) => pick.slug === 'flowise')).toBe(false)
    const retired = freeAgents?.picks.find((pick) => pick.slug === 'relevance-ai')
    if (retired) expect(retired.budgetFit).toBe('over')
    expect(freeAgents?.picks.some((pick) => pick.budgetFit === 'within' && pick.hasFreeTier)).toBe(true)

    const coding = recommend(catalog, { task: 'coding', budget: 'any', skill: 'intermediate' })
    expect(coding?.picks.some((pick) => pick.slug === 'roo-code')).toBe(false)
    expect(coding?.picks[0]?.slug).not.toBe('roo-code')

    const excluded = selectQuizPicks(
      [
        {
          slug: 'roo-code',
          name: 'Roo Code',
          skillLevel: 'intermediate',
          pricingModel: 'freemium',
          hasFreeTier: true,
          priceFromUsd: null,
          fitScore: 99,
          notes: 'Would have won.',
          quizEligible: false,
        },
        {
          slug: 'zed',
          name: 'Zed',
          skillLevel: 'intermediate',
          pricingModel: 'freemium',
          hasFreeTier: true,
          priceFromUsd: null,
          fitScore: 60,
          notes: 'Still eligible.',
        },
      ],
      { budget: 'any', skill: 'intermediate' },
    )
    expect(excluded.map((pick) => pick.slug)).toEqual(['zed'])

    const chat = recommend(catalog, { task: 'chat', budget: 'any', skill: 'beginner' })
    const grok = chat?.picks.find((pick) => pick.slug === 'grok')
    expect(grok?.tool.editorial?.tied).toBe(true)
    expect(grok?.tool.pros).toEqual([])
    expect(grok?.tool.cons).toEqual([])
    expect(catalog.tools.find((tool) => tool.slug === 'semantic-scholar')?.pros).toEqual([])
    expect(catalog.tools.find((tool) => tool.slug === 'semantic-scholar')?.cons).toEqual([])
    expect(supplementalProsConsSeeds.map((row) => row.slug).sort()).toEqual(['aider', 'canva', 'composio', 'consensus', 'cursor', 'd-id', 'kimi', 'kling', 'languagetool', 'mistral-voxtral', 'omnara', 'perplexity', 'podcastle', 'quillbot', 'twinmind', 'windsurf', 'writer'])
    const perplexity = chat?.picks.find((pick) => pick.slug === 'perplexity')
    expect(perplexity?.tool.editorial?.overall).toBe(3.9)
    expect(chat?.picks.some((pick) => pick.tool.editorial)).toBe(true)
  })
})
