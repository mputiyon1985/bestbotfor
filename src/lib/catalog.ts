import 'server-only'

import { unstable_cache } from 'next/cache'
import { asc, eq } from 'drizzle-orm'
import { assembleCatalog, readPublicSlugs, readTaskCandidates, readTasks, readToolCategoryCounts, readToolPage, readToolSummaries, readToolsBySlugs, scoreLoadedQuiz, searchToolSummaries } from './catalog-read'
import type { Catalog, CatalogTask, CatalogTool } from './catalog-types'
import { getDb } from './db'
import { affiliatePrograms, tasks, toolProsCons, toolScores, toolTasks, tools } from './db/schema'
import type { QuizAnswers } from './validation'

async function loadCatalog(): Promise<Catalog> {
  const db = getDb()
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

export const getCatalog = unstable_cache(loadCatalog, ['catalog-v4'], { revalidate: 3600 })

/** Tool, directory, and match pages reuse one read for five minutes. The layout stays dynamic because of the nonce. */
const CATALOG_PAGE_REVALIDATE_SECONDS = 300

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
  ['tool-by-slug-v1'],
)

const loadToolsBySlugs = catalogPageCache(
  async (slugs: string[]) => readToolsBySlugs(getDb(), slugs),
  ['tools-by-slugs-v1'],
)

const loadTask = catalogPageCache(
  async (slug: string) => {
    const db = getDb()
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
  },
  ['task-by-slug-v1'],
)

const loadTasks = catalogPageCache(async () => readTasks(getDb()), ['tasks-v1'])

const loadToolPage = catalogPageCache(
  async (page: number, category: string | null) => readToolPage(getDb(), page, category),
  ['tool-page-v1'],
)

const loadToolCategoryCounts = catalogPageCache(async () => readToolCategoryCounts(getDb()), ['tool-category-counts-v1'])

const loadTaskCandidates = catalogPageCache(
  async (taskSlug: string) => readTaskCandidates(getDb(), taskSlug),
  ['task-candidates-v1'],
)

const loadSearch = catalogPageCache(
  async (query: string) => searchToolSummaries(getDb(), query),
  ['tool-search-v1'],
)

const loadPublicSlugs = catalogPageCache(
  async () => readPublicSlugs(getDb()),
  ['public-slugs-v1'],
)

const loadToolSummaries = catalogPageCache(
  async () => readToolSummaries(getDb()),
  ['tool-summaries-v1'],
)

export async function getTool(slug: string): Promise<CatalogTool | undefined> {
  const tool = await loadTool(slug)
  return tool ?? undefined
}

export async function getToolsBySlugs(slugs: string[]): Promise<CatalogTool[]> {
  return loadToolsBySlugs(slugs)
}

export async function getTask(slug: string): Promise<CatalogTask | undefined> {
  const task = await loadTask(slug)
  return task ?? undefined
}

export async function listTasks(): Promise<CatalogTask[]> {
  return loadTasks()
}

export async function listToolPage(page: number, category: string | null = null) {
  return loadToolPage(page, category)
}

export async function listToolCategoryCounts() {
  return loadToolCategoryCounts()
}

export async function listTaskCandidates(taskSlug: string) {
  return loadTaskCandidates(taskSlug)
}

export async function recommendQuiz(answers: QuizAnswers) {
  const loaded = await listTaskCandidates(answers.task)
  if (!loaded) return null
  return scoreLoadedQuiz(loaded, answers)
}

export async function searchCatalog(query: string) {
  return loadSearch(query)
}

export async function listPublicSlugs() {
  return loadPublicSlugs()
}

export async function listToolSummaries() {
  return loadToolSummaries()
}
