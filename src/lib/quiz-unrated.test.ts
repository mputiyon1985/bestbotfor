import { describe, expect, it } from 'vitest'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { createTestDatabase } from '@/test/db'
import { tasks, toolScores, toolTasks, tools } from './db/schema'
import { readTaskCandidates, readToolPage, scoreLoadedQuiz } from './catalog-read'
import { listMatches, matchBudgets } from './matches'
import { recommend } from './recommend'
import { isQuizMatchable, selectQuizPicks } from './scoring'

const catalog = catalogFromSeeds()
const skills = ['beginner', 'intermediate', 'pro'] as const

describe('unrated tools and the quiz', () => {
  it('gates on the editorial rating in the quiz logic itself', () => {
    expect(isQuizMatchable({ fitScore: 99, quizEligible: true, editorial: null })).toBe(false)
    expect(isQuizMatchable({ fitScore: 80, quizEligible: true, editorial: { overall: 4 } })).toBe(true)
    const base = { skillLevel: 'beginner' as const, pricingModel: 'free' as const, hasFreeTier: true, priceFromUsd: 0, notes: 'n' }
    const picks = selectQuizPicks(
      [
        { ...base, slug: 'unrated', name: 'Unrated', fitScore: 99, editorial: null },
        { ...base, slug: 'rated', name: 'Rated', fitScore: 60, editorial: { overall: 3 } },
      ],
      { budget: 'any', skill: 'beginner' },
    )
    expect(picks.map((pick) => pick.slug)).toEqual(['rated'])
    expect(listMatches([{ ...base, slug: 'unrated', name: 'Unrated', fitScore: 99, editorial: null }], 'any')).toEqual([])
  })

  it('never returns an unrated tool for any task, budget or skill', () => {
    const unrated = new Set(catalog.tools.filter((tool) => tool.editorial === null).map((tool) => tool.slug))
    expect(unrated.size).toBeGreaterThan(18)
    for (const task of catalog.tasks) {
      for (const budget of matchBudgets) {
        for (const skill of skills) {
          const result = recommend(catalog, { task: task.slug, budget, skill })
          for (const pick of result?.picks ?? []) expect(unrated.has(pick.slug), `${task.slug}/${budget}/${skill}: ${pick.slug}`).toBe(false)
        }
      }
    }
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

  it('drops unrated tools from the DB quiz and all matches, and labels them Unrated on the tools index', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(tasks).values({ slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk.' })
    const row = (id: number, slug: string) => ({
      id, slug, name: slug, vendor: slug, url: `https://${slug}.example`, category: 'Chat', shortDesc: 's', longDesc: 'l',
      pricingModel: 'freemium', priceFromUsd: 0, hasFreeTier: true, skillLevel: 'beginner', platforms: '["Web"]',
      lastVerifiedAt: '2026-10-22', status: 'active',
    })
    await db.insert(tools).values([row(1, 'rated'), row(2, 'unrated')])
    await db.insert(toolTasks).values([
      { toolId: 1, taskId: 1, fitScore: 70, notes: 'Rated.' },
      { toolId: 2, taskId: 1, fitScore: 95, notes: 'Unrated.' },
    ])
    await db.insert(toolScores).values({
      toolId: 1, features: 3.5, value: 3.5, ease: 3.5, quality: 3.5, overall: 3.5, rationale: 'r', sources: '[]', reviewedAt: '2026-10-22', quizEligible: true,
    })
    const loaded = await readTaskCandidates(db, 'chat')
    expect(loaded?.tools.map((tool) => tool.slug).sort()).toEqual(['rated', 'unrated'])
    const quiz = scoreLoadedQuiz(loaded!, { task: 'chat', budget: 'any', skill: 'beginner' })
    expect(quiz.picks.map((pick) => pick.slug)).toEqual(['rated'])
    expect(quiz.matchCount).toBe(1)
    const page = await readToolPage(db, 1, 'Chat')
    expect(page.tools.map((tool) => [tool.slug, tool.rated])).toEqual([
      ['rated', true],
      ['unrated', false],
    ])
    await close()
  })
})
