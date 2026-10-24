import { describe, expect, it } from 'vitest'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { createTestDatabase } from '@/test/db'
import { tasks, toolScores, toolTasks, tools } from './db/schema'
import { readTaskCandidates, readToolPage, scoreLoadedQuiz } from './catalog-read'
import { listMatches, matchBudgets } from './matches'
import { recommend } from './recommend'
import { isQuizMatchable, selectQuizPicks } from './scoring'
import { ratingRequiredSlugs } from './quiz-gate'

const catalog = catalogFromSeeds()
const skills = ['beginner', 'intermediate', 'pro'] as const

describe('unrated tools and the quiz', () => {
  it('marks exactly the tools added in #138, the #142 expansion and addendum, and the 2026-10-24 scout', () => {
    expect([...ratingRequiredSlugs].sort()).toEqual(
      [
        'twinmind', 'useit-studio', 'cutbay', 'dadan', 'sponkly', 'playad', 'fastlane', 'radaric', 'mistral-voxtral',
        'mercury-inception', 'composio', 'mintlify', 'runinfra', 'band', 'needle', 'tend', 'omnara', 'opposable',
        'notif', 'causo', 'supercmo', 'bits',
        // #142 expansion
        'amp', 'factory', 'aider', 'jetbrains-ai', 'napkin-ai', 'copy-ai', 'getimg', 'magnific', 'd-id', 'kling',
        'hailuo', 'tldv', 'krisp', 'voiceflow',
        // expansion addendum
        'genspark', 'gamma', 'quillbot', 'manus', 'nightcafe', 'consensus',
        // bot scout 2026-10-24
        'deepcell', 'heal-dev', 'movo-ai', 'monid', 'ovren', 'shogunai', 'context-engine', 'klaussy-review', 'polylane',
        'plango', 'sideos', 'sellto-us', 'zcad-ai', 'monish',
      ].sort(),
    )
    for (const slug of ['perplexity', 'soundraw', 'canva', 'surfer']) expect(ratingRequiredSlugs.has(slug), slug).toBe(false)
  })

  it('gates only new unrated tools in the quiz logic itself', () => {
    expect(isQuizMatchable({ slug: 'dadan', fitScore: 99, quizEligible: true, editorial: null })).toBe(false)
    expect(isQuizMatchable({ slug: 'twinmind', fitScore: 80, quizEligible: true, editorial: { overall: 4 } })).toBe(true)
    expect(isQuizMatchable({ slug: 'perplexity', fitScore: 96, quizEligible: true, editorial: null })).toBe(true)
    const base = { skillLevel: 'beginner' as const, pricingModel: 'free' as const, hasFreeTier: true, priceFromUsd: 0, notes: 'n' }
    const picks = selectQuizPicks(
      [
        { ...base, slug: 'dadan', name: 'Dadan', fitScore: 99, editorial: null },
        { ...base, slug: 'perplexity', name: 'Perplexity', fitScore: 90, editorial: null },
        { ...base, slug: 'rated', name: 'Rated', fitScore: 60, editorial: { overall: 3 } },
      ],
      { budget: 'any', skill: 'beginner' },
    )
    expect(picks.map((pick) => pick.slug)).toEqual(['perplexity', 'rated'])
    expect(listMatches([{ ...base, slug: 'dadan', name: 'Dadan', fitScore: 99, editorial: null }], 'any')).toEqual([])
  })

  it('never returns a new unrated tool for any task, budget or skill', () => {
    const newUnrated = new Set(catalog.tools.filter((tool) => tool.editorial === null && ratingRequiredSlugs.has(tool.slug)).map((tool) => tool.slug))
    expect(newUnrated.size).toBe(51) // 18 unrated scout tools minus unlisted Mercury 3, plus 14 unrated expansion tools, plus 6 addendum tools, plus 14 scout 2026-10-24 tools
    for (const task of catalog.tasks) {
      for (const budget of matchBudgets) {
        for (const skill of skills) {
          const result = recommend(catalog, { task: task.slug, budget, skill })
          for (const pick of result?.picks ?? []) expect(newUnrated.has(pick.slug), `${task.slug}/${budget}/${skill}: ${pick.slug}`).toBe(false)
        }
      }
    }
  })

  it('leaves pre-existing unrated tools in the quiz (Perplexity in Research)', () => {
    const perplexity = catalog.tools.find((tool) => tool.slug === 'perplexity')
    expect(perplexity?.editorial?.overall).toBe(3.9)
    expect(catalog.tools.find((tool) => tool.slug === 'soundraw')?.editorial).toBeNull()
    for (const slug of ['canva', 'surfer']) expect(ratingRequiredSlugs.has(slug), slug).toBe(false)
    const research = recommend(catalog, { task: 'research', budget: 'any', skill: 'beginner' })
    expect(research?.picks.some((pick) => pick.slug === 'perplexity')).toBe(true)
    const chat = recommend(catalog, { task: 'chat', budget: 'any', skill: 'beginner' })
    expect(chat?.picks.some((pick) => pick.slug === 'perplexity')).toBe(true)
    const music = recommend(catalog, { task: 'music', budget: 'low', skill: 'beginner' })
    expect(music?.picks.find((pick) => pick.slug === 'soundraw')?.budgetFit).toBe('within')
  })

  it('keeps the four rated scout tools in the quiz at overall x20', () => {
    for (const slug of ['twinmind', 'mistral-voxtral', 'composio', 'omnara']) {
      const tool = catalog.tools.find((item) => item.slug === slug)
      expect(tool?.editorial, slug).not.toBeNull()
      const fit = tool?.fits[0]
      expect(fit?.score, slug).toBe(Math.round((tool?.editorial?.overall ?? 0) * 20))
      const result = recommend(catalog, { task: fit?.taskSlug ?? '', budget: 'any', skill: 'pro' })
      const matches = listMatches(
        catalog.tools.flatMap((item) => {
          const f = item.fits.find((x) => x.taskSlug === fit?.taskSlug)
          return f ? [{ ...item, fitScore: f.score, notes: f.notes }] : []
        }),
        'any',
      )
      expect(matches.some((item) => item.slug === slug), slug).toBe(true)
      expect(result).toBeTruthy()
    }
  })

  it('drops a new unrated tool from the DB quiz, keeps an old one, and labels both Unrated on the tools index', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(tasks).values({ slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk.' })
    const row = (id: number, slug: string) => ({
      id, slug, name: slug, vendor: slug, url: `https://${slug}.example`, category: 'Chat', shortDesc: 's', longDesc: 'l',
      pricingModel: 'freemium', priceFromUsd: 0, hasFreeTier: true, skillLevel: 'beginner', platforms: '["Web"]',
      lastVerifiedAt: '2026-10-22', status: 'active',
    })
    await db.insert(tools).values([row(1, 'rated'), row(2, 'dadan'), row(3, 'perplexity')])
    await db.insert(toolTasks).values([
      { toolId: 1, taskId: 1, fitScore: 70, notes: 'Rated.' },
      { toolId: 2, taskId: 1, fitScore: 95, notes: 'New and unrated.' },
      { toolId: 3, taskId: 1, fitScore: 60, notes: 'Old and unrated.' },
    ])
    await db.insert(toolScores).values({
      toolId: 1, features: 3.5, value: 3.5, ease: 3.5, quality: 3.5, overall: 3.5, rationale: 'r', sources: '[]', reviewedAt: '2026-10-22', quizEligible: true,
    })
    const loaded = await readTaskCandidates(db, 'chat')
    expect(loaded?.tools.map((tool) => tool.slug).sort()).toEqual(['dadan', 'perplexity', 'rated'])
    const quiz = scoreLoadedQuiz(loaded!, { task: 'chat', budget: 'any', skill: 'beginner' })
    expect(quiz.picks.map((pick) => pick.slug)).toEqual(['rated', 'perplexity'])
    expect(quiz.matchCount).toBe(2)
    const page = await readToolPage(db, 1, 'Chat')
    expect(page.tools.map((tool) => [tool.slug, tool.rated])).toEqual([
      ['dadan', false],
      ['perplexity', false],
      ['rated', true],
    ])
    await close()
  })
})
