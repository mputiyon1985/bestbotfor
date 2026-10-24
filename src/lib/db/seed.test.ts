import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { taskSeeds, toolSeeds } from '@/data/catalog'
import { seed } from '../../../scripts/seed'
import { getDb, resetDbCache } from './client'
import { applyMigrations } from './migrate'
import { generateMetadata as toolMetadata } from '@/app/tools/[slug]/page'
import { editorialSeeds } from '@/data/scores-pros-cons.seed'
import { keptProsConsSeeds, ratingSeeds, supplementalProsConsSeeds, unratedSlugs } from '@/data/scores-v23.seed'
import {
  affiliatePrograms,
  clicks,
  moderationEvents,
  reviewAggregates,
  reviewReports,
  reviewVersions,
  reviews,
  tasks,
  toolProsCons,
  toolScores,
  toolTasks,
  toolVendorDomains,
  tools,
} from './schema'

const previousUrl = process.env.TURSO_DATABASE_URL
const previousToken = process.env.TURSO_AUTH_TOKEN
const previousPrune = process.env.SEED_PRUNE

function pointTotal(rows: { pros: unknown[]; cons: unknown[] }[]): number {
  return rows.reduce((total, row) => total + row.pros.length + row.cons.length, 0)
}

const prosConsTotal = pointTotal(editorialSeeds) + pointTotal(supplementalProsConsSeeds)
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
  if (previousPrune === undefined) delete process.env.SEED_PRUNE
  else process.env.SEED_PRUNE = previousPrune
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

describe('vendor domain seed', () => {
  it('upserts one tool_url domain per tool, keeps manual rows, and does not write reviews', async () => {
    await useTempDatabase()
    await seed()
    const db = getDb()
    const toolRows = (await db.select().from(tools)).filter((row) => row.status === 'active')
    const domains = await db.select().from(toolVendorDomains)
    expect(domains.length).toBeGreaterThanOrEqual(toolRows.length)
    expect(domains.every((row) => row.source === 'tool_url')).toBe(true)
    const byTool = new Map<number, number>()
    for (const row of domains) byTool.set(row.toolId, (byTool.get(row.toolId) ?? 0) + 1)
    expect(byTool.size).toBe(toolRows.length)

    const sample = toolRows[0]
    expect(sample).toBeTruthy()
    if (!sample) return
    await db.insert(toolVendorDomains).values({
      toolId: sample.id,
      domain: 'manual-vendor.test',
      source: 'manual',
      createdAt: 1,
    })
    await seed()
    const again = await db.select().from(toolVendorDomains)
    expect(again.filter((row) => row.source === 'tool_url')).toHaveLength(domains.length)
    const manual = again.find((row) => row.domain === 'manual-vendor.test')
    expect(manual?.source).toBe('manual')
    expect(manual?.createdAt).toBe(1)

    const [reviewCount] = await db.select({ n: count() }).from(reviews)
    const [versionCount] = await db.select({ n: count() }).from(reviewVersions)
    const [reportCount] = await db.select({ n: count() }).from(reviewReports)
    const [aggregateCount] = await db.select({ n: count() }).from(reviewAggregates)
    const [eventCount] = await db.select({ n: count() }).from(moderationEvents)
    expect(Number(reviewCount?.n ?? 0)).toBe(0)
    expect(Number(versionCount?.n ?? 0)).toBe(0)
    expect(Number(reportCount?.n ?? 0)).toBe(0)
    expect(Number(aggregateCount?.n ?? 0)).toBe(0)
    expect(Number(eventCount?.n ?? 0)).toBe(0)
  })
})

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

  it('replaces v2.3 scores and drops score rows for tools that are not rated', async () => {
    await useTempDatabase()
    await seed()
    const db = getDb()
    const toolRows = await db.select().from(tools)
    const claude = toolRows.find((row) => row.slug === 'claude')
    expect(claude).toBeTruthy()
    if (!claude) return
    await db.insert(toolScores).values({
      toolId: 999_999,
      features: 1,
      value: 1,
      ease: 1,
      quality: 1,
      overall: 1,
      rationale: 'Keep this sentinel score.',
      sources: '["https://example.com"]',
      reviewedAt: '2026-10-16',
    })
    await db.insert(toolProsCons).values({
      toolId: 999_999,
      kind: 'pro',
      position: 1,
      body: 'Keep this sentinel point.',
      sourceUrl: 'https://example.com',
    })
    await db.update(toolScores).set({ rationale: 'stale rationale' }).where(eq(toolScores.toolId, claude.id))

    process.env.SEED_PRUNE = '1'
    await seed()

    const scores = await db.select().from(toolScores)
    const points = await db.select().from(toolProsCons)
    const expectedPoints = prosConsTotal + 1
    expect(scores).toHaveLength(ratingSeeds.length)
    expect(points).toHaveLength(expectedPoints)
    const claudeRating = ratingSeeds.find((row) => row.slug === 'claude')
    const restored = scores.find((row) => row.toolId === claude.id)
    expect(restored?.rationale).toBe(claudeRating?.rationale)
    expect(restored?.overall).toBe(claudeRating?.overall)
    expect(restored?.sources).toBe('[]')
    expect(restored?.categoryRankDisplay).toBe(claudeRating?.categoryRankDisplay)
    expect(restored?.note).toBe(claudeRating?.note ?? '')
    const windsurf = toolRows.find((row) => row.slug === 'windsurf')
    expect(windsurf?.name).toBe('Devin Desktop (formerly Windsurf)')
    expect(windsurf?.vendor).toBe('Cognition')
    expect(windsurf?.url).toBe('https://devin.ai/desktop')
    expect(windsurf?.needsVerification).toBe(false)
    expect(scores.some((row) => row.toolId === windsurf?.id)).toBe(true)
    expect(points.some((row) => row.toolId === windsurf?.id && row.body.includes('Tab completions'))).toBe(true)
    const relevance = toolRows.find((row) => row.slug === 'relevance-ai')
    expect(relevance?.hasFreeTier).toBe(false)
    expect(relevance?.priceFromUsd).toBe(19)
    expect(scores.some((row) => row.toolId === relevance?.id)).toBe(false)
    const relevancePoints = editorialSeeds.find((row) => row.slug === 'relevance-ai')
    expect(relevancePoints).toBeTruthy()
    const storedRelevance = points.filter((row) => row.toolId === relevance?.id)
    expect(storedRelevance.filter((row) => row.kind === 'pro').map((row) => row.body)).toEqual(
      relevancePoints?.pros.map((point) => point.text),
    )
    expect(storedRelevance.filter((row) => row.kind === 'con').map((row) => row.body)).toEqual(
      relevancePoints?.cons.map((point) => point.text),
    )
    expect(scores.some((row) => row.toolId === 999_999)).toBe(false)
    expect(points.some((row) => row.toolId === 999_999 && row.body === 'Keep this sentinel point.')).toBe(true)
    const claudePros = points.filter((row) => row.toolId === claude.id && row.kind === 'pro')
    const v1Pros = keptProsConsSeeds.find((row) => row.slug === 'claude')?.pros.map((point) => point.text)
    expect(claudePros.map((row) => row.body)).toEqual(v1Pros)
  })

  it('rates exactly the CSV slugs', async () => {
    await useTempDatabase()
    await seed()
    const db = getDb()
    const toolRows = await db.select().from(tools)
    const bySlug = new Map(toolRows.map((row) => [row.slug, row]))
    const cursor = bySlug.get('cursor')
    const windsurf = bySlug.get('windsurf')
    const chatgpt = bySlug.get('chatgpt')
    expect(cursor).toBeTruthy()
    expect(windsurf).toBeTruthy()
    expect(chatgpt).toBeTruthy()
    if (!cursor || !windsurf || !chatgpt) return

    const scores = await db.select().from(toolScores)
    const points = await db.select().from(toolProsCons)
    const idToSlug = new Map(toolRows.map((row) => [row.id, row.slug]))
    const rated = scores.map((row) => idToSlug.get(row.toolId)).sort()
    const csvSlugs = ratingSeeds.map((row) => row.slug).sort()
    const v1Slugs = new Set(editorialSeeds.map((row) => row.slug))
    expect(ratingSeeds).toHaveLength(98)
    expect(unratedSlugs).toHaveLength(117)
    expect(rated).toEqual(csvSlugs)
    expect(new Set(rated)).toEqual(new Set(csvSlugs))
    expect(csvSlugs).toContain('cursor')
    expect(csvSlugs).toContain('windsurf')
    expect(scores.every((row) => row.sources === '[]')).toBe(true)
    expect(JSON.stringify(scores)).not.toContain('pcmag.com')
    expect(JSON.stringify(scores)).not.toContain('techradar.com')
    expect(JSON.stringify(scores)).not.toContain('evidence.jsonl')
    expect(JSON.stringify(scores)).not.toContain('third_party')
    expect(JSON.stringify(scores)).not.toContain('source_urls')
    expect(scores.some((row) => row.toolId === cursor.id)).toBe(true)
    expect(scores.some((row) => row.toolId === windsurf.id)).toBe(true)
    expect(points.filter((row) => row.toolId === cursor.id && row.kind === 'pro').map((row) => row.body)).toEqual(
      supplementalProsConsSeeds.find((row) => row.slug === 'cursor')?.pros.map((point) => point.text),
    )
    expect(points.filter((row) => row.toolId === windsurf.id && row.kind === 'con').map((row) => row.body)).toEqual(
      supplementalProsConsSeeds.find((row) => row.slug === 'windsurf')?.cons.map((point) => point.text),
    )
    for (const slug of ['grok', 'semantic-scholar'] as const) {
      expect(points.some((row) => row.toolId === bySlug.get(slug)?.id), slug).toBe(false)
    }
    expect(scores.some((row) => row.toolId === chatgpt.id)).toBe(true)
    const kept = keptProsConsSeeds.length
    const removedSlugs = editorialSeeds.filter((row) => !csvSlugs.includes(row.slug))
    expect(kept).toBe(88)
    expect(removedSlugs).toHaveLength(58)
    expect(ratingSeeds.filter((row) => !v1Slugs.has(row.slug)).map((row) => row.slug).sort()).toEqual([
      'canva',
      'composio',
      'cursor',
      'grok',
      'mistral-voxtral',
      'omnara',
      'perplexity',
      'semantic-scholar',
      'twinmind',
      'windsurf',
    ])
    const keptPoints = keptProsConsSeeds.reduce((total, row) => total + row.pros.length + row.cons.length, 0)
    const unratedPoints = removedSlugs.reduce((total, row) => total + row.pros.length + row.cons.length, 0)
    expect(keptPoints).toBe(444)
    expect(unratedPoints).toBe(291)
    expect(points).toHaveLength(keptPoints + unratedPoints + pointTotal(supplementalProsConsSeeds))

    for (const slug of unratedSlugs) {
      const tool = bySlug.get(slug)
      expect(tool, slug).toBeTruthy()
      expect(scores.some((row) => row.toolId === tool?.id), slug).toBe(false)
      const v1 = editorialSeeds.find((row) => row.slug === slug)
      const stored = points.filter((row) => row.toolId === tool?.id)
      expect(stored.filter((row) => row.kind === 'pro').map((row) => row.body), slug).toEqual(v1?.pros.map((point) => point.text) ?? [])
      expect(stored.filter((row) => row.kind === 'con').map((row) => row.body), slug).toEqual(v1?.cons.map((point) => point.text) ?? [])
      expect(ratingSeeds.some((row) => row.slug === slug), slug).toBe(false)
    }
    expect(windsurf.name).toBe('Devin Desktop (formerly Windsurf)')
    expect(windsurf.vendor).toBe('Cognition')
    expect(windsurf.url).toBe('https://devin.ai/desktop')
    expect(windsurf.needsVerification).toBe(false)
    expect(windsurf.priceFromUsd).toBe(20)
    expect(windsurf.hasFreeTier).toBe(true)
    expect(cursor.priceFromUsd).toBe(8)
    expect(cursor.hasFreeTier).toBe(true)
    expect(cursor.longDesc).toContain('Pro $20 is for legacy subscribers only')

    const relevance = bySlug.get('relevance-ai')
    const seeded = toolSeeds.find((tool) => tool.slug === 'relevance-ai')
    expect(seeded?.hasFreeTier).toBe(false)
    expect(seeded?.pricingModel).toBe('paid')
    expect(seeded?.priceFromUsd).toBe(19)
    expect(relevance?.hasFreeTier).toBe(false)
    expect(relevance?.pricingModel).toBe('paid')
    expect(relevance?.priceFromUsd).toBe(19)

    const sql = await readFile(path.join(process.cwd(), 'drizzle/0007_drop_non_forge_scores.sql'), 'utf8')
    const named = [...new Set([...sql.matchAll(/slug IN \('([^']+)'\)/g)].map((match) => match[1]))]
    expect(named).toEqual(['cursor'])
    await db.$client.executeMultiple(sql)
    const deleted = await db.select().from(toolScores)
    expect(deleted.some((row) => row.toolId === cursor.id)).toBe(false)
    expect(deleted.some((row) => row.toolId === chatgpt.id)).toBe(true)
    await seed()
    const restoredRows = await db.select().from(tools)
    const restoredIds = new Map(restoredRows.map((row) => [row.id, row.slug]))
    const restoredCursor = restoredRows.find((row) => row.slug === 'cursor')
    const restoredScores = await db.select().from(toolScores)
    const restored = restoredScores.map((row) => restoredIds.get(row.toolId)).sort()
    const restoredPoints = await db.select().from(toolProsCons)
    expect(restored).toEqual(csvSlugs)
    expect(restoredPoints.filter((row) => row.toolId === restoredCursor?.id && row.kind === 'pro').map((row) => row.body)).toEqual(
      supplementalProsConsSeeds.find((row) => row.slug === 'cursor')?.pros.map((point) => point.text),
    )
    const cursorScore = restoredScores.find((row) => row.toolId === restoredCursor?.id)
    expect(cursorScore?.overall).toBe(ratingSeeds.find((row) => row.slug === 'cursor')?.overall)
    expect(cursorScore?.sources).toBe('[]')

    const fresh = await seed()
    expect(fresh).toEqual({
      scoresInserted: 0,
      scoresUpdated: 98,
      scoresRemoved: 0,
      prosInserted: 0,
      prosUpdated: prosConsTotal,
      prosRemoved: 0,
    })

    const previousEnv = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'production'
    try {
      const meta = await toolMetadata({ params: Promise.resolve({ slug: 'windsurf' }) })
      expect(meta.robots).toEqual({ index: true, follow: true })
      expect(meta.title).toEqual({ absolute: 'Devin Desktop (formerly Windsurf) Review (2026)' })
      expect(String(meta.alternates?.canonical)).toBe('https://bestbotfor.com/tools/windsurf')
    } finally {
      if (previousEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previousEnv
    }
  })

  it('counts v1 inserts, updates, and deletes, and replaces stale Cursor and Windsurf scores', async () => {
    await useTempDatabase()
    const fresh = await seed()
    expect(fresh).toEqual({
      scoresInserted: 98,
      scoresUpdated: 0,
      scoresRemoved: 0,
      prosInserted: prosConsTotal,
      prosUpdated: 0,
      prosRemoved: 0,
    })

    const db = getDb()
    const toolRows = await db.select().from(tools)
    const bySlug = new Map(toolRows.map((row) => [row.slug, row]))
    await db.delete(toolScores)
    await db.delete(toolProsCons)
    for (const row of editorialSeeds) {
      const id = bySlug.get(row.slug)?.id
      expect(id, row.slug).toBeTruthy()
      if (!id) return
      await db.insert(toolScores).values({
        toolId: id,
        features: row.features,
        value: row.value,
        ease: row.ease,
        quality: row.quality,
        overall: row.overall,
        rationale: row.rationale,
        sources: '["https://example.com/stale"]',
        reviewedAt: row.reviewedAt,
      })
      const points = [
        ...row.pros.map((point, index) => ({ kind: 'pro' as const, position: index + 1, body: point.text, sourceUrl: point.sourceUrl })),
        ...row.cons.map((point, index) => ({ kind: 'con' as const, position: index + 1, body: point.text, sourceUrl: point.sourceUrl })),
      ]
      for (const point of points) {
        await db.insert(toolProsCons).values({ toolId: id, ...point })
      }
    }

    process.env.SEED_PRUNE = '1'
    const fromV1 = await seed()
    expect(fromV1).toEqual({
      scoresInserted: 10,
      scoresUpdated: 88,
      scoresRemoved: 58,
      prosInserted: pointTotal(supplementalProsConsSeeds),
      prosUpdated: pointTotal(editorialSeeds),
      prosRemoved: 0,
    })

    const cursor = bySlug.get('cursor')
    const windsurf = bySlug.get('windsurf')
    const unratedTool = bySlug.get('dadan')
    const relevance = bySlug.get('relevance-ai')
    expect(cursor && windsurf && unratedTool && relevance).toBeTruthy()
    if (!cursor || !windsurf || !unratedTool || !relevance) return
    const stale = {
      features: 1,
      value: 1,
      ease: 1,
      quality: 1,
      overall: 1,
      rationale: 'Stale score that the v2.3 seed must not leave in place.',
      sources: '["https://stale.example/old"]',
      reviewedAt: '2020-01-01',
    }
    await db.update(toolScores).set(stale).where(eq(toolScores.toolId, cursor.id))
    await db.update(toolScores).set(stale).where(eq(toolScores.toolId, windsurf.id))
    await db.insert(toolScores).values({ toolId: unratedTool.id, ...stale })
    await db.insert(toolScores).values({ toolId: relevance.id, ...stale })
    await db
      .update(toolProsCons)
      .set({ body: 'Stale cursor pro that the next seed replaces.', sourceUrl: 'https://stale.example/cursor' })
      .where(and(eq(toolProsCons.toolId, cursor.id), eq(toolProsCons.kind, 'pro'), eq(toolProsCons.position, 1)))
    await db
      .update(toolProsCons)
      .set({ body: 'Stale windsurf pro that the next seed replaces.', sourceUrl: 'https://stale.example/windsurf' })
      .where(and(eq(toolProsCons.toolId, windsurf.id), eq(toolProsCons.kind, 'pro'), eq(toolProsCons.position, 1)))
    await db.insert(toolProsCons).values({
      toolId: unratedTool.id,
      kind: 'pro',
      position: 1,
      body: 'Stale unrated pro that must stay.',
      sourceUrl: 'https://stale.example/dadan',
    })

    const replaced = await seed()
    expect(replaced).toEqual({
      scoresInserted: 0,
      scoresUpdated: 98,
      scoresRemoved: 2,
      prosInserted: 0,
      prosUpdated: prosConsTotal,
      prosRemoved: 0,
    })

    const scores = await db.select().from(toolScores)
    const points = await db.select().from(toolProsCons)
    const idToSlug = new Map(toolRows.map((row) => [row.id, row.slug]))
    const rated = scores.map((row) => idToSlug.get(row.toolId)).sort()
    expect(rated).toEqual(ratingSeeds.map((row) => row.slug).sort())
    for (const slug of unratedSlugs) {
      const tool = bySlug.get(slug)
      expect(scores.some((row) => row.toolId === tool?.id), slug).toBe(false)
      const v1 = editorialSeeds.find((row) => row.slug === slug)
      const bodies = points.filter((row) => row.toolId === tool?.id).map((row) => row.body)
      for (const point of [...(v1?.pros ?? []), ...(v1?.cons ?? [])]) {
        expect(bodies, slug).toContain(point.text)
      }
    }
    expect(points.some((row) => row.toolId === unratedTool.id && row.body === 'Stale unrated pro that must stay.')).toBe(true)
    for (const slug of ['cursor', 'windsurf'] as const) {
      const tool = bySlug.get(slug)
      const score = scores.find((row) => row.toolId === tool?.id)
      const expected = ratingSeeds.find((row) => row.slug === slug)
      const seededPoints = supplementalProsConsSeeds.find((row) => row.slug === slug)
      expect(score?.overall).toBe(expected?.overall)
      expect(score?.rationale).toBe(expected?.rationale)
      expect(score?.sources).toBe('[]')
      expect(score?.reviewedAt).toBe(expected?.reviewedAt)
      expect(points.some((row) => row.toolId === tool?.id && row.body.startsWith('Stale'))).toBe(false)
      expect(points.filter((row) => row.toolId === tool?.id && row.kind === 'pro').map((row) => row.body)).toEqual(
        seededPoints?.pros.map((point) => point.text),
      )
    }
    expect(JSON.stringify(scores)).not.toContain('stale.example')
    expect(points.filter((row) => row.sourceUrl.includes('stale.example'))).toHaveLength(1)
  })

  it('upserts scores and leaves rows that are not in the file unless SEED_PRUNE=1', async () => {
    delete process.env.SEED_PRUNE
    await useTempDatabase()
    await seed()
    const db = getDb()
    const claude = (await db.select().from(tools)).find((row) => row.slug === 'claude')
    expect(claude).toBeTruthy()
    if (!claude) return
    await db.insert(toolScores).values({
      toolId: 999_999,
      features: 1,
      value: 1,
      ease: 1,
      quality: 1,
      overall: 1,
      rationale: 'Keep this extra score.',
      sources: '[]',
      reviewedAt: '2026-10-16',
    })
    await db.update(toolScores).set({ rationale: 'stale rationale' }).where(eq(toolScores.toolId, claude.id))
    const counts = await seed()
    expect(counts.scoresRemoved).toBe(0)
    const scores = await db.select().from(toolScores)
    expect(scores).toHaveLength(ratingSeeds.length + 1)
    expect(scores.some((row) => row.toolId === 999_999)).toBe(true)
    expect(scores.find((row) => row.toolId === claude.id)?.rationale).toBe(ratingSeeds.find((row) => row.slug === 'claude')?.rationale)
  })
})
