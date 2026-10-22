import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { comparePairSeeds, taskSeeds, toolSeeds } from '@/data/catalog'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { getDb, resetDbCache } from '@/lib/db/client'
import { applyMigrations } from '@/lib/db/migrate'
import { affiliatePrograms, tasks, toolTasks, tools } from '@/lib/db/schema'
import { officialHttpsUrl } from '@/lib/redirect'
import { priceLabel } from '@/lib/format'
import { recommend, toolsForTask } from '@/lib/recommend'
import { MIN_QUIZ_FIT_SCORE, QUIZ_RESULT_COUNT } from '@/lib/scoring'
import { slugSchema, type Budget, type Skill } from '@/lib/validation'
import { seed } from '../../scripts/seed'

const directories: string[] = []
const originalUrl = process.env.TURSO_DATABASE_URL
let opened = false

afterEach(async () => {
  if (opened) {
    getDb().$client.close()
    opened = false
  }
  resetDbCache()
  if (originalUrl === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = originalUrl
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('catalog seed', () => {
  it('loads every seed tool into a fresh database with no affiliate links', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-catalog-'))
    directories.push(root)
    const url = `file:${path.join(root, 'catalog.db')}`
    process.env.TURSO_DATABASE_URL = url
    resetDbCache()
    opened = true
    await applyMigrations(url)
    await seed()
    await seed()

    const db = getDb()
    const [toolRows, taskRows, fitRows, programs] = await Promise.all([
      db.select().from(tools),
      db.select().from(tasks),
      db.select().from(toolTasks),
      db.select().from(affiliatePrograms),
    ])

    expect(toolRows).toHaveLength(toolSeeds.length)
    expect(taskRows).toHaveLength(taskSeeds.length)
    expect(programs).toHaveLength(toolSeeds.length)
    expect(new Set(toolRows.map((row) => row.slug))).toEqual(new Set(toolSeeds.map((tool) => tool.slug)))
    expect(programs.every((row) => row.affiliateUrl == null)).toBe(true)

    const programByTool = new Map(programs.map((row) => [row.toolId, row]))
    const idBySlug = new Map(toolRows.map((row) => [row.slug, row.id]))
    for (const tool of toolSeeds) {
      const id = idBySlug.get(tool.slug)
      const program = id == null ? undefined : programByTool.get(id)
      expect(program?.status, tool.slug).toBe(tool.affiliate.status)
      expect(program?.hasProgram, tool.slug).toBe(tool.affiliate.hasProgram)
      expect(program?.sourceUrl, tool.slug).toBe(tool.affiliate.sourceUrl)
    }

    const expectedFits = toolSeeds.reduce((sum, tool) => sum + tool.fits.length, 0)
    expect(fitRows).toHaveLength(expectedFits)
    expect(toolRows.filter((row) => row.status !== 'active').map((row) => [row.slug, row.status])).toEqual([['mercury-inception', 'unlisted']])
    expect(toolRows.find((row) => row.slug === 'soundraw')?.priceFromUsd).toBe(16.99)
    expect(toolRows.find((row) => row.slug === 'semrush')).toMatchObject({
      pricingModel: 'freemium',
      hasFreeTier: true,
      priceFromUsd: 139.95,
    })
  })

  it('keeps quiz, best-of, and compare resolvable for the whole seed', () => {
    const catalog = catalogFromSeeds()
    const slugs = new Set(catalog.tools.map((tool) => tool.slug))
    expect(new Set(toolSeeds.map((tool) => tool.slug)).size).toBe(toolSeeds.length)

    for (const tool of toolSeeds) {
      expect(slugSchema.safeParse(tool.slug).success, tool.slug).toBe(true)
      expect(tool.allowedHosts.length, tool.slug).toBeGreaterThan(0)
      expect(officialHttpsUrl(tool.url, tool.allowedHosts), tool.slug).not.toBeNull()
      expect(tool.url.includes('?'), tool.slug).toBe(false)
      expect(tool.slug.includes('-vs-'), tool.slug).toBe(false)
      for (const fit of tool.fits) {
        expect(taskSeeds.some((task) => task.slug === fit.task), `${tool.slug} ${fit.task}`).toBe(true)
        expect(fit.notes, `${tool.slug} ${fit.task}`).not.toContain('Secondary fit')
      }
    }

    const budgets: Budget[] = ['free', 'low', 'any']
    const skills: Skill[] = ['beginner', 'intermediate', 'pro']
    const droppedFits = [
      ['hyperwrite', 'seo'],
      ['wondercraft', 'music'],
      ['podcastle', 'music'],
      ['listnr', 'music'],
      ['notebooklm', 'music'],
      ['descript', 'music'],
      ['lalal-ai', 'music'],
    ] as const
    for (const [slug, task] of droppedFits) {
      const entry = toolSeeds.find((item) => item.slug === slug)
      expect(entry?.fits.some((fit) => fit.task === task), `${slug} ${task}`).toBe(false)
    }
    const sunoMusic = toolSeeds.find((item) => item.slug === 'suno')?.fits.find((fit) => fit.task === 'music')
    expect(sunoMusic?.notes).toBe('You describe a song and get the audio, including vocals.')
    expect(sunoMusic?.notes).not.toContain('the music tool')
    const elevenMusic = toolSeeds.find((item) => item.slug === 'elevenlabs')?.fits.find((fit) => fit.task === 'music')
    expect(elevenMusic).toEqual({
      task: 'music',
      score: 86,
      notes: 'Eleven Music generates songs with vocals; commercial use needs a paid plan.',
    })
    for (const [slug, score] of [
      ['udio', 88],
      ['aiva', 78],
      ['soundraw', 74],
      ['mubert', 72],
      ['semrush', 90],
      ['ahrefs', 90],
      ['clearscope', 88],
      ['marketmuse', 85],
      ['neuronwriter', 84],
      ['se-ranking', 84],
    ] as const) {
      const entry = toolSeeds.find((item) => item.slug === slug)
      expect(entry?.lastVerifiedAt, slug).toBe('2026-10-16')
      expect(entry?.allowedHosts.length, slug).toBeGreaterThan(0)
      const fit = entry?.fits[0]
      expect(fit?.score, slug).toBe(score)
    }
    expect(toolSeeds.find((item) => item.slug === 'semrush')).toMatchObject({
      pricingModel: 'freemium',
      hasFreeTier: true,
      priceFromUsd: 139.95,
    })
    expect(toolSeeds.find((item) => item.slug === 'soundraw')?.priceFromUsd).toBe(16.99)
    expect(toolSeeds.find((item) => item.slug === 'neuronwriter')?.priceFromUsd).toBe(23)
    expect(toolSeeds.find((item) => item.slug === 'luma-dream-machine')?.priceFromUsd).toBe(30)
    expect(toolSeeds.find((item) => item.slug === 'aiva')?.priceFromUsd).toBeNull()
    const musicLow = recommend(catalog, { task: 'music', budget: 'low', skill: 'beginner' })
    const soundraw = musicLow?.picks.find((pick) => pick.slug === 'soundraw')
    expect(soundraw?.budgetFit).toBe('within')
    expect(musicLow?.picks.some((pick) => pick.slug === 'lalal-ai')).toBe(false)

    for (const task of taskSeeds) {
      const ranked = toolsForTask(catalog, task.slug)
      const fitted = toolSeeds.filter((tool) => tool.fits.some((fit) => fit.task === task.slug))
      expect(ranked, task.slug).toHaveLength(fitted.length)
      const qualified = fitted.filter((tool) => (tool.fits.find((fit) => fit.task === task.slug)?.score ?? 0) >= MIN_QUIZ_FIT_SCORE)
      for (const budget of budgets) {
        for (const skill of skills) {
          const result = recommend(catalog, { task: task.slug, budget, skill })
          const picks = result?.picks ?? []
          expect(picks, `${task.slug} ${budget} ${skill}`).toHaveLength(Math.min(QUIZ_RESULT_COUNT, qualified.length))
          for (const pick of picks) {
            expect(pick.fitScore, pick.slug).toBeGreaterThanOrEqual(MIN_QUIZ_FIT_SCORE)
            expect(pick.reason, pick.slug).toBe(pick.notes)
            expect(pick.reason.includes('\n'), pick.slug).toBe(false)
            expect(pick.reason.length, pick.slug).toBeGreaterThan(20)
            expect(priceLabel(pick).length, pick.slug).toBeGreaterThan(0)
            if (pick.budgetFit === 'over') expect(pick.fitScore).toBeGreaterThanOrEqual(MIN_QUIZ_FIT_SCORE)
            if (budget === 'low' && pick.budgetFit === 'over') {
              expect(pick.hasFreeTier, pick.slug).toBe(false)
              expect(pick.priceFromUsd, pick.slug).not.toBeNull()
              expect(pick.priceFromUsd ?? 0, pick.slug).toBeGreaterThan(30)
            }
            if (budget === 'low' && pick.budgetFit === 'unknown') {
              expect(pick.priceFromUsd, pick.slug).toBeNull()
              expect(pick.hasFreeTier, pick.slug).toBe(false)
              expect(pick.pricingModel, pick.slug).not.toBe('free')
            }
          }
        }
      }
    }

    for (const [a, b] of comparePairSeeds) {
      expect(slugs.has(a), a).toBe(true)
      expect(slugs.has(b), b).toBe(true)
    }
  })
})
