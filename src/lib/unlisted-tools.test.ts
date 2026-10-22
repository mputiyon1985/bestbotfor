import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { seed } from '../../scripts/seed'
import { getDb, resetDbCache } from './db/client'
import { applyMigrations } from './db/migrate'
import { tools } from './db/schema'
import { assembleCatalog, readPublicSlugs, readTaskCandidates, readToolPage, readToolsBySlugs, searchToolSummaries } from './catalog-read'
import { resolveHeadGoRedirect } from './go-redirect'
import { CATALOG_TOOL_COUNT } from './seo-pages'
import { readFileSync } from 'node:fs'

const UNLISTED = 'mercury-inception'
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

describe('unlisted tools', () => {
  it('only Mercury 3 is unlisted, and it keeps its record and is not quiz eligible', () => {
    expect(toolSeeds.filter((tool) => tool.unlisted).map((tool) => tool.slug)).toEqual([UNLISTED])
    expect(CATALOG_TOOL_COUNT).toBe(toolSeeds.length - 1)
    const csv = readFileSync(path.join(process.cwd(), 'src/data/scores-v2.3.csv'), 'utf8')
    const row = csv.split('\n').find((line) => line.startsWith(`${UNLISTED},`))
    expect(row?.trimEnd().endsWith(',Active,false,')).toBe(true)
  })

  it('/go answers 404 for an unlisted tool', () => {
    expect(resolveHeadGoRedirect(UNLISTED).status).toBe(404)
    expect(resolveHeadGoRedirect('twinmind').status).toBe(302)
  })

  it('seeds the record as unlisted and every public read skips it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-unlisted-'))
    directories.push(root)
    const url = `file:${path.join(root, 'seed.db')}`
    process.env.TURSO_DATABASE_URL = url
    delete process.env.TURSO_AUTH_TOKEN
    resetDbCache()
    await applyMigrations(url)
    resetDbCache()
    await seed()
    const db = getDb()

    const [row] = await db.select().from(tools).where(eq(tools.slug, UNLISTED))
    expect(row?.status).toBe('unlisted')
    expect(row?.name).toBe('Mercury 3')

    const slugs = await readPublicSlugs(db)
    expect(slugs.tools).not.toContain(UNLISTED)
    expect(slugs.tools).toContain('twinmind')
    expect(await readToolsBySlugs(db, [UNLISTED])).toEqual([])
    const backend = await readTaskCandidates(db, 'backend')
    expect(backend?.tools.map((tool) => tool.slug)).not.toContain(UNLISTED)
    expect((await searchToolSummaries(db, 'Mercury')).map((tool) => tool.slug)).not.toContain(UNLISTED)
    const page = await readToolPage(db, 1, 'Development')
    expect(page.tools.map((tool) => tool.slug)).not.toContain(UNLISTED)
    const allRows = await db.select().from(tools)
    const catalog = assembleCatalog([], allRows, [], [])
    expect(catalog.tools.map((tool) => tool.slug)).not.toContain(UNLISTED)
    expect(catalog.tools).toHaveLength(toolSeeds.length - 1)
  })
})
