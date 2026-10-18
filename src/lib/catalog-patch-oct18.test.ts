import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { retiredFitSeeds, toolSeeds } from '@/data/catalog'
import { seed } from '../../scripts/seed'
import { getDb, resetDbCache } from './db/client'
import { applyMigrations } from './db/migrate'
import { tasks, toolTasks, tools } from './db/schema'
import { listMatches } from './matches'
import { officialHttpsUrl } from './redirect'
import { toolsForTask } from './recommend'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'

const seedOf = (slug: string) => {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('catalog patch, Oct 18 (Forge free-plan check)', () => {
  it('removes the free tier from Pictory, Pika and Resemble AI', () => {
    for (const slug of ['pictory', 'pika', 'resemble-ai']) expect(seedOf(slug).hasFreeTier, slug).toBe(false)
    const catalog = catalogFromSeeds()
    const free = (task: string) => listMatches(toolsForTask(catalog, task), 'free').map((tool) => tool.slug)
    expect(free('video')).not.toContain('pictory')
    expect(free('video')).not.toContain('pika')
    expect(free('voice')).not.toContain('resemble-ai')
  })

  it('takes Resemble AI off the voice list and retires that fit', () => {
    expect(seedOf('resemble-ai').fits.some((fit) => fit.task === 'voice')).toBe(false)
    expect(toolsForTask(catalogFromSeeds(), 'voice').map((tool) => tool.slug)).not.toContain('resemble-ai')
    expect(retiredFitSeeds).toContainEqual(['resemble-ai', 'voice'])
  })

  it('renames Podcastle to Async at async.com, keeping the slug and the Async logo', () => {
    expect(seedOf('podcastle')).toMatchObject({ name: 'Async', vendor: 'Async', url: 'https://async.com', allowedHosts: ['async.com'] })
  })

  it('points moved vendors at their new domains and allows only the new host', () => {
    const moved: [string, string, string][] = [
      ['kilo-code', 'https://kilo.ai', 'kilocode.ai'],
      ['playground', 'https://playgroundai.com', 'playground.com'],
      ['runway', 'https://runway.com', 'runwayml.com'],
      ['podcastle', 'https://async.com', 'podcastle.ai'],
    ]
    for (const [slug, url, old] of moved) {
      const tool = seedOf(slug)
      expect(tool.url, slug).toBe(url)
      expect(officialHttpsUrl(tool.url, tool.allowedHosts), slug).not.toBeNull()
      expect(officialHttpsUrl(`https://${old}/`, tool.allowedHosts), slug).toBeNull()
    }
  })
})

describe('seed retires removed fits', () => {
  const previousUrl = process.env.TURSO_DATABASE_URL
  let root = ''
  afterEach(async () => {
    try {
      getDb().$client.close()
    } catch {
      // not opened
    }
    resetDbCache()
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL
    else process.env.TURSO_DATABASE_URL = previousUrl
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('deletes a retired pair that an older seed left in tool_tasks', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-retired-'))
    const url = `file:${path.join(root, 'seed.db')}`
    process.env.TURSO_DATABASE_URL = url
    resetDbCache()
    await applyMigrations(url)
    resetDbCache()
    await seed()
    const db = getDb()
    const [tool] = await db.select().from(tools).where(eq(tools.slug, 'resemble-ai'))
    const [task] = await db.select().from(tasks).where(eq(tasks.slug, 'voice'))
    expect(tool && task).toBeTruthy()
    if (!tool || !task) return
    // What production has today: the old voice fit.
    await db.insert(toolTasks).values({ toolId: tool.id, taskId: task.id, fitScore: 74, notes: 'old' })
    await seed()
    const rows = await db.select().from(toolTasks).where(and(eq(toolTasks.toolId, tool.id), eq(toolTasks.taskId, task.id)))
    expect(rows).toHaveLength(0)
    expect(tool.hasFreeTier).toBe(false)
  }, 60_000)
})
