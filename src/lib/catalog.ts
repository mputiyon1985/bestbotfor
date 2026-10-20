import 'server-only'

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { asc, eq } from 'drizzle-orm'
import { assembleCatalog, readPublicSlugs, readTaskCandidates, readTasks, readToolCategoryCounts, readToolPage, readToolSummaries, readToolsBySlugs, scoreLoadedQuiz, searchToolSummaries } from './catalog-read'
import type { Catalog, CatalogTask, CatalogTool } from './catalog-types'
import { getDb } from './db'
import { affiliatePrograms, tasks, toolProsCons, toolScores, toolTasks, tools } from './db/schema'
import type { QuizAnswers } from './validation'
import { taskSeeds } from '@/data/catalog'
import { CatalogUnavailableError, withReadFallback } from './catalog-fallback'
import { getCatalogFallbackDb } from './catalog-fallback-db'
import { catalogCacheKey, warnIfLocalCatalogVersionInProduction } from './catalog-version'
import type { Database } from './db'

async function loadCatalog(): Promise<Catalog> {
  return readCatalog(getDb())
}

async function readCatalog(db: Database): Promise<Catalog> {
  const [taskRows, toolRows, fitRows, affiliateRows, scoreRows, proConRows] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.name)),
    db.select().from(tools).orderBy(asc(tools.name)),
    db.select().from(toolTasks),
    db.select().from(affiliatePrograms),
    db.select().from(toolScores),
    db.select().from(toolProsCons),
  ])
  return assembleCatalog(taskRows, toolRows, fitRows, affiliateRows, scoreRows, proConRows)
}

/**
 * Catalog content only changes on deploy/seed, so long revalidate windows are safe
 * and keep Turso reads well under the plan limit (the Oct 20 outage was Turso
 * blocking reads at that limit). Next keeps serving the stale entry if a
 * background revalidation fails.
 */
export const CATALOG_REVALIDATE_SECONDS = 6 * 60 * 60

warnIfLocalCatalogVersionInProduction()

const cachedCatalog = unstable_cache(loadCatalog, catalogCacheKey('catalog-v4'), { revalidate: CATALOG_REVALIDATE_SECONDS })

/** Runs a catalog reader against the bundled seed database. Used only after Turso fails. */
function fromFallbackDb<Result>(read: (db: Database) => Promise<Result>): () => Promise<Result> {
  return async () => {
    const db = getCatalogFallbackDb()
    if (!db) throw new CatalogUnavailableError('fallback-db')
    return read(db)
  }
}

export const getCatalog = cache(() => withReadFallback('catalog', [], cachedCatalog, fromFallbackDb(readCatalog)))

/** Tool, directory, and match pages reuse one read for an hour. The layout stays dynamic because of the nonce. */
export const CATALOG_PAGE_REVALIDATE_SECONDS = 60 * 60

function catalogPageCache<Args extends unknown[], Result>(
  loader: (...args: Args) => Promise<Result>,
  keyParts: string[],
): (...args: Args) => Promise<Result> {
  if (process.env.VITEST === 'true') return loader
  return unstable_cache(loader, keyParts, { revalidate: CATALOG_PAGE_REVALIDATE_SECONDS })
}

const loadTool = catalogPageCache(
  async (slug: string) => {
    const [tool] = await readToolsBySlugs(getDb(), [slug])
    return tool ?? null
  },
  catalogCacheKey('tool-by-slug-v1'),
)

const loadToolsBySlugs = catalogPageCache(
  async (slugs: string[]) => readToolsBySlugs(getDb(), slugs),
  catalogCacheKey('tools-by-slugs-v1'),
)

const loadTask = catalogPageCache(
  async (slug: string) => readTask(getDb(), slug),
  catalogCacheKey('task-by-slug-v1'),
)

async function readTask(db: Database, slug: string): Promise<CatalogTask | null> {
    const [task] = await db
      .select({
        slug: tasks.slug,
        name: tasks.name,
        category: tasks.category,
        description: tasks.description,
      })
      .from(tasks)
      .where(eq(tasks.slug, slug))
      .limit(1)
    return task ?? null
}

const loadTasks = catalogPageCache(async () => readTasks(getDb()), catalogCacheKey('tasks-v1'))

const loadToolPage = catalogPageCache(
  async (page: number, category: string | null) => readToolPage(getDb(), page, category),
  catalogCacheKey('tool-page-v1'),
)

const loadToolCategoryCounts = catalogPageCache(async () => readToolCategoryCounts(getDb()), catalogCacheKey('tool-category-counts-v1'))

const loadTaskCandidates = catalogPageCache(
  async (taskSlug: string) => readTaskCandidates(getDb(), taskSlug),
  catalogCacheKey('task-candidates-v1'),
)

const loadSearch = catalogPageCache(
  async (query: string) => searchToolSummaries(getDb(), query),
  catalogCacheKey('tool-search-v1'),
)

const loadPublicSlugs = catalogPageCache(
  async () => readPublicSlugs(getDb()),
  catalogCacheKey('public-slugs-v1'),
)

const loadToolSummaries = catalogPageCache(
  async () => readToolSummaries(getDb()),
  catalogCacheKey('tool-summaries-v1'),
)

// React cache() dedupes within one request: generateMetadata and the page body
// share a single lookup instead of each going to the data cache / Turso.
// withReadFallback serves the last good value (or bundled seed data) when the
// database errors, instead of failing the request with a 500.

const getToolCached = cache(
  async (slug: string) =>
    (await withReadFallback('tool', [slug], loadTool, fromFallbackDb(async (db) => (await readToolsBySlugs(db, [slug]))[0] ?? null), {
      missIsUnavailable: true,
    })) ??
    undefined,
)
export async function getTool(slug: string): Promise<CatalogTool | undefined> {
  return getToolCached(slug)
}

const getToolsBySlugsCached = cache((key: string) => {
  const slugs = JSON.parse(key) as string[]
  return withReadFallback('tools-by-slugs', [slugs], loadToolsBySlugs, fromFallbackDb((db) => readToolsBySlugs(db, slugs)))
})
export async function getToolsBySlugs(slugs: string[]): Promise<CatalogTool[]> {
  // Arrays are compared by identity in cache(), so key on a lossless string.
  return getToolsBySlugsCached(JSON.stringify(slugs))
}

function seedTask(slug: string): CatalogTask | null {
  const seed = taskSeeds.find((task) => task.slug === slug)
  return seed ? { slug: seed.slug, name: seed.name, category: seed.category, description: seed.description } : null
}

/** Last resort when even the fallback file is missing: tasks are small and live in the bundle. */
function withSeed<Result>(read: () => Promise<Result>, seed: () => Result): () => Promise<Result> {
  return async () => {
    try {
      return await read()
    } catch (error) {
      console.error(`[catalog] fallback DB read failed (${error instanceof Error ? error.name : 'unknown'}); using bundled task seeds`)
      return seed()
    }
  }
}

const getTaskCached = cache(
  async (slug: string) =>
    (await withReadFallback('task', [slug], loadTask, withSeed(fromFallbackDb((db) => readTask(db, slug)), () => seedTask(slug)), {
      missIsUnavailable: true,
    })) ??
    undefined,
)
export async function getTask(slug: string): Promise<CatalogTask | undefined> {
  return getTaskCached(slug)
}

const seedTasks = (): CatalogTask[] =>
  taskSeeds
    .map((task) => ({ slug: task.slug, name: task.name, category: task.category, description: task.description }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

export const listTasks = cache(
  (): Promise<CatalogTask[]> => withReadFallback('tasks', [], loadTasks, withSeed(fromFallbackDb(readTasks), seedTasks)),
)

export const listToolPage = cache((page: number, category: string | null = null) =>
  withReadFallback('tool-page', [page, category], loadToolPage, fromFallbackDb((db) => readToolPage(db, page, category))),
)

export const listToolCategoryCounts = cache(() =>
  withReadFallback('tool-category-counts', [], loadToolCategoryCounts, fromFallbackDb(readToolCategoryCounts)),
)

export const listTaskCandidates = cache((taskSlug: string) =>
  // missIsUnavailable keeps /best/<task> from 404ing in an outage. The quiz result
  // validates the task slug first and also needs the live DB, so it is unaffected.
  withReadFallback('task-candidates', [taskSlug], loadTaskCandidates, fromFallbackDb((db) => readTaskCandidates(db, taskSlug)), {
    missIsUnavailable: true,
  }),
)

export async function recommendQuiz(answers: QuizAnswers) {
  const loaded = await listTaskCandidates(answers.task)
  if (!loaded) return null
  return scoreLoadedQuiz(loaded, answers)
}

export const searchCatalog = cache((query: string) =>
  withReadFallback('tool-search', [query], loadSearch, fromFallbackDb((db) => searchToolSummaries(db, query))),
)

export const listPublicSlugs = cache(() => withReadFallback('public-slugs', [], loadPublicSlugs, fromFallbackDb(readPublicSlugs)))

export const listToolSummaries = cache(() =>
  withReadFallback('tool-summaries', [], loadToolSummaries, fromFallbackDb(readToolSummaries)),
)
