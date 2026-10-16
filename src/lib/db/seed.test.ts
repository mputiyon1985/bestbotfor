import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { taskSeeds, toolSeeds } from '@/data/catalog'
import { seed } from '../../../scripts/seed'
import { getDb, resetDbCache } from './client'
import { applyMigrations } from './migrate'
import { affiliatePrograms, clicks, tasks, toolTasks, tools } from './schema'

const previousUrl = process.env.TURSO_DATABASE_URL
const previousToken = process.env.TURSO_AUTH_TOKEN
const directories: string[] = []

afterEach(async () => {
  try {
    getDb().$client.close()
  } catch {
    // The database was not opened.
  }
  resetDbCache()
  if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = previousUrl
  if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN
  else process.env.TURSO_AUTH_TOKEN = previousToken
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function useTempDatabase(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-seed-'))
  directories.push(root)
  const url = `file:${path.join(root, 'seed.db')}`
  process.env.TURSO_DATABASE_URL = url
  delete process.env.TURSO_AUTH_TOKEN
  resetDbCache()
  await applyMigrations(url)
  resetDbCache()
}

async function rowCounts() {
  const db = getDb()
  const [toolCount] = await db.select({ n: count() }).from(tools)
  const [taskCount] = await db.select({ n: count() }).from(tasks)
  const [fitCount] = await db.select({ n: count() }).from(toolTasks)
  const [programCount] = await db.select({ n: count() }).from(affiliatePrograms)
  return {
    tools: Number(toolCount?.n ?? 0),
    tasks: Number(taskCount?.n ?? 0),
    toolTasks: Number(fitCount?.n ?? 0),
    affiliatePrograms: Number(programCount?.n ?? 0),
  }
}

describe('catalog seed', () => {
  it('seeds twice against a local libsql file and keeps the same row counts', async () => {
    await useTempDatabase()
    await seed()
    const first = await rowCounts()
    await seed()
    expect(await rowCounts()).toEqual(first)
    expect(first).toEqual({
      tools: toolSeeds.length,
      tasks: taskSeeds.length,
      toolTasks: toolSeeds.reduce((total, tool) => total + tool.fits.length, 0),
      affiliatePrograms: toolSeeds.length,
    })
  })

  it('leaves rows that are not in the catalog in place on a second seed', async () => {
    await useTempDatabase()
    await seed()
    const db = getDb()
    await db.insert(tools).values({
      slug: 'sentinel-tool',
      name: 'Sentinel',
      vendor: 'Test',
      url: 'https://example.com',
      category: 'Test',
      shortDesc: 'Keep',
      longDesc: 'Keep',
      pricingModel: 'free',
      priceFromUsd: null,
      hasFreeTier: true,
      skillLevel: 'beginner',
      platforms: '[]',
      lastVerifiedAt: '2026-10-15',
      status: 'active',
    })
    await db.insert(tasks).values({
      slug: 'sentinel-task',
      name: 'Sentinel',
      category: 'Test',
      description: 'Keep',
    })
    await db.insert(toolTasks).values({
      toolId: 999_999,
      taskId: 999_999,
      fitScore: 1,
      notes: 'keep',
    })
    await db.insert(clicks).values({
      toolId: 1,
      page: '/sentinel',
      ts: 1,
    })

    const before = await rowCounts()
    await seed()
    expect(await rowCounts()).toEqual(before)

    const [keptFit] = await db.select().from(toolTasks).where(eq(toolTasks.toolId, 999_999))
    const [keptTool] = await db.select().from(tools).where(eq(tools.slug, 'sentinel-tool'))
    const [keptTask] = await db.select().from(tasks).where(eq(tasks.slug, 'sentinel-task'))
    const [keptClick] = await db.select().from(clicks).where(eq(clicks.page, '/sentinel'))
    expect(keptFit?.notes).toBe('keep')
    expect(keptTool?.name).toBe('Sentinel')
    expect(keptTask?.name).toBe('Sentinel')
    expect(keptClick?.page).toBe('/sentinel')
  })

  it('deletes retired quiz fits and does not restore them on a later seed', async () => {
    await useTempDatabase()
    await seed()
    const db = getDb()
    const toolRows = await db.select().from(tools)
    const taskRows = await db.select().from(tasks)
    const toolId = new Map(toolRows.map((row) => [row.slug, row.id]))
    const taskId = new Map(taskRows.map((row) => [row.slug, row.id]))
    const retired = [
      ['hyperwrite', 'seo'],
      ['wondercraft', 'music'],
      ['podcastle', 'music'],
      ['listnr', 'music'],
      ['notebooklm', 'music'],
      ['descript', 'music'],
      ['lalal-ai', 'music'],
    ] as const
    for (const [toolSlug, taskSlug] of retired) {
      const retiredToolId = toolId.get(toolSlug)
      const retiredTaskId = taskId.get(taskSlug)
      expect(retiredToolId, toolSlug).toBeTruthy()
      expect(retiredTaskId, taskSlug).toBeTruthy()
      await db.insert(toolTasks).values({
        toolId: retiredToolId ?? 0,
        taskId: retiredTaskId ?? 0,
        fitScore: 40,
        notes: 'stale fit',
      })
    }

    const sql = await readFile(path.join(process.cwd(), 'drizzle/0004_retire_quiz_fits.sql'), 'utf8')
    await db.$client.executeMultiple(sql)
    await db.$client.executeMultiple(sql)

    const slugByTool = new Map(toolRows.map((row) => [row.id, row.slug]))
    const slugByTask = new Map(taskRows.map((row) => [row.id, row.slug]))
    const pair = (row: { toolId: number; taskId: number }) => `${slugByTool.get(row.toolId)}:${slugByTask.get(row.taskId)}`
    const afterDelete = await db.select().from(toolTasks)
    for (const [toolSlug, taskSlug] of retired) {
      expect(afterDelete.some((row) => pair(row) === `${toolSlug}:${taskSlug}`)).toBe(false)
    }
    expect(afterDelete.some((row) => pair(row) === 'notebooklm:chat')).toBe(true)
    expect(afterDelete.some((row) => pair(row) === 'hyperwrite:writing')).toBe(true)
    expect(afterDelete.some((row) => pair(row) === 'descript:video')).toBe(true)
    expect(afterDelete.some((row) => pair(row) === 'elevenlabs:music')).toBe(true)
    expect(afterDelete.some((row) => pair(row) === 'lalal-ai:voice')).toBe(true)

    await seed()
    const afterSeed = await db.select().from(toolTasks)
    expect(afterSeed).toHaveLength(afterDelete.length)
    for (const [toolSlug, taskSlug] of retired) {
      expect(afterSeed.some((row) => pair(row) === `${toolSlug}:${taskSlug}`)).toBe(false)
    }
    const eleven = afterSeed.find((row) => pair(row) === 'elevenlabs:music')
    expect(eleven?.fitScore).toBe(86)
    expect(eleven?.notes).toBe('Eleven Music generates songs with vocals; commercial use needs a paid plan.')
  })
})
