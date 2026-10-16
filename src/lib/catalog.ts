import 'server-only'

import { unstable_cache } from 'next/cache'
import { asc, eq } from 'drizzle-orm'
import { assembleCatalog, readPublicSlugs, readTaskCandidates, readTasks, readToolCategoryCounts, readToolPage, readToolSummaries, readToolsBySlugs, scoreQuiz, searchToolSummaries } from './catalog-read'
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

export const getCatalog = unstable_cache(loadCatalog, ['catalog-v3'], { revalidate: 3600 })

export async function getTool(slug: string): Promise<CatalogTool | undefined> {
  const [tool] = await readToolsBySlugs(getDb(), [slug])
  return tool
}

export async function getToolsBySlugs(slugs: string[]): Promise<CatalogTool[]> {
  return readToolsBySlugs(getDb(), slugs)
}

export async function getTask(slug: string): Promise<CatalogTask | undefined> {
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
  return task
}

export async function listTasks(): Promise<CatalogTask[]> {
  return readTasks(getDb())
}

export async function listToolPage(page: number, category: string | null = null) {
  return readToolPage(getDb(), page, category)
}

export async function listToolCategoryCounts() {
  return readToolCategoryCounts(getDb())
}

export async function listTaskCandidates(taskSlug: string) {
  return readTaskCandidates(getDb(), taskSlug)
}

export async function recommendQuiz(answers: QuizAnswers) {
  return scoreQuiz(getDb(), answers)
}

export async function searchCatalog(query: string) {
  return searchToolSummaries(getDb(), query)
}

export async function listPublicSlugs() {
  return readPublicSlugs(getDb())
}

export async function listToolSummaries() {
  return readToolSummaries(getDb())
}
