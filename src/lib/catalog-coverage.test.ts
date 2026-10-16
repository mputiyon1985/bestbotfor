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
import { fitsBudget, QUIZ_RESULT_COUNT } from '@/lib/scoring'
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
    expect(toolRows.every((row) => row.status === 'active')).toBe(true)
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
    for (const task of taskSeeds) {
      const ranked = toolsForTask(catalog, task.slug)
      const fitted = toolSeeds.filter((tool) => tool.fits.some((fit) => fit.task === task.slug))
      expect(ranked, task.slug).toHaveLength(fitted.length)
      expect(ranked.length, task.slug).toBeGreaterThanOrEqual(8)
      for (const budget of budgets) {
        for (const skill of skills) {
          const result = recommend(catalog, { task: task.slug, budget, skill })
          expect(result?.picks.length, `${task.slug} ${budget} ${skill}`).toBeGreaterThanOrEqual(QUIZ_RESULT_COUNT)
          const picks = result?.picks ?? []
          const withinCount = fitted.filter((item) => fitsBudget(item, budget)).length
          const withinPicks = picks.filter((pick) => pick.budgetFit === 'within')
          const overPicks = picks.filter((pick) => pick.budgetFit === 'over')
          expect(withinPicks, `${task.slug} ${budget}`).toHaveLength(Math.min(withinCount, QUIZ_RESULT_COUNT))
          expect(overPicks, `${task.slug} ${budget}`).toHaveLength(QUIZ_RESULT_COUNT - withinPicks.length)
          for (let index = 1; index < overPicks.length; index += 1) {
            expect(overPicks[index - 1]!.fitScore).toBeGreaterThanOrEqual(overPicks[index]!.fitScore)
          }
          for (const pick of picks) {
            expect(pick.reason, pick.slug).toBe(pick.notes)
            expect(pick.reason.includes('\n'), pick.slug).toBe(false)
            expect(pick.reason.length, pick.slug).toBeGreaterThan(20)
            expect(priceLabel(pick).length, pick.slug).toBeGreaterThan(0)
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
