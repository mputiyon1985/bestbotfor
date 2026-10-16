import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from './db/client'
import { affiliatePrograms, tasks, toolTasks, tools } from './db/schema'
import { listMatches } from './matches'
import { selectQuizPicks } from './scoring'
import type { Catalog, CatalogFit, CatalogTask, CatalogTool, PricingModel } from './catalog-types'
import type { QuizAnswers, Skill } from './validation'
import { z } from 'zod'

const pricingSchema = z.enum(['free', 'freemium', 'paid'])
const skillSchema = z.enum(['beginner', 'intermediate', 'pro'])
const platformSchema = z.array(z.string())

export const TOOLS_PAGE_SIZE = 24
export const SEARCH_LIMIT = 40

type ToolRow = typeof tools.$inferSelect
type FitRow = typeof toolTasks.$inferSelect
type AffiliateRow = typeof affiliatePrograms.$inferSelect
type TaskRow = typeof tasks.$inferSelect

export type ToolSummary = {
  slug: string
  name: string
  vendor: string
  category: string
  shortDesc: string
}

export type ToolPage = {
  tools: ToolSummary[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export type TaskCandidate = {
  slug: string
  name: string
  shortDesc: string
  skillLevel: Skill
  pricingModel: PricingModel
  hasFreeTier: boolean
  priceFromUsd: number | null
  lastVerifiedAt: string
  fitScore: number
  notes: string
}

function platformsOf(value: string): string[] {
  try {
    const parsed = platformSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

function affiliateOf(row: AffiliateRow | undefined): CatalogTool['affiliate'] {
  return {
    hasProgram: row?.hasProgram ?? false,
    network: row?.network ?? null,
    sourceUrl: row?.sourceUrl ?? null,
    status: (row?.status ?? 'none') as CatalogTool['affiliate']['status'],
    commissionNote: row?.commissionNote ?? null,
    affiliateUrl: row?.affiliateUrl ?? null,
  }
}

/** Group fit rows once so catalog assembly stays linear as the tool count grows. */
export function assembleCatalog(
  taskRows: TaskRow[],
  toolRows: ToolRow[],
  fitRows: FitRow[],
  affiliateRows: AffiliateRow[],
): Catalog {
  const taskById = new Map(taskRows.map((task) => [task.id, task]))
  const affiliateByTool = new Map(affiliateRows.map((row) => [row.toolId, row]))
  const fitsByTool = new Map<number, FitRow[]>()
  for (const fit of fitRows) {
    const list = fitsByTool.get(fit.toolId)
    if (list) list.push(fit)
    else fitsByTool.set(fit.toolId, [fit])
  }

  const catalogTasks: CatalogTask[] = taskRows.map((task) => ({
    slug: task.slug,
    name: task.name,
    category: task.category,
    description: task.description,
  }))

  const catalogTools: CatalogTool[] = toolRows
    .filter((tool) => tool.status === 'active')
    .map((tool) => toolRecord(tool, fitsByTool.get(tool.id) ?? [], taskById, affiliateByTool.get(tool.id)))

  return { tasks: catalogTasks, tools: catalogTools }
}

function toolRecord(
  tool: ToolRow,
  fitRows: FitRow[],
  taskById: Map<number, TaskRow>,
  affiliate: AffiliateRow | undefined,
): CatalogTool {
  const fits: CatalogFit[] = fitRows
    .map((fit) => {
      const task = taskById.get(fit.taskId)
      return {
        taskSlug: task?.slug ?? '',
        taskName: task?.name ?? '',
        score: fit.fitScore,
        notes: fit.notes,
      }
    })
    .filter((fit) => fit.taskSlug)
    .sort((a, b) => b.score - a.score || a.taskName.localeCompare(b.taskName))

  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    vendor: tool.vendor,
    url: tool.url,
    category: tool.category,
    shortDesc: tool.shortDesc,
    longDesc: tool.longDesc,
    pricingModel: pricingSchema.parse(tool.pricingModel) as PricingModel,
    priceFromUsd: tool.priceFromUsd,
    hasFreeTier: tool.hasFreeTier,
    skillLevel: skillSchema.parse(tool.skillLevel) as Skill,
    platforms: platformsOf(tool.platforms),
    lastVerifiedAt: tool.lastVerifiedAt,
    fits,
    affiliate: affiliateOf(affiliate),
  }
}

async function hydrateTools(db: Database, rows: ToolRow[]): Promise<CatalogTool[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const [fitRows, affiliateRows] = await Promise.all([
    db.select().from(toolTasks).where(inArray(toolTasks.toolId, ids)),
    db.select().from(affiliatePrograms).where(inArray(affiliatePrograms.toolId, ids)),
  ])
  const taskIds = [...new Set(fitRows.map((fit) => fit.taskId))]
  const taskRows = taskIds.length > 0 ? await db.select().from(tasks).where(inArray(tasks.id, taskIds)) : []
  const taskById = new Map(taskRows.map((task) => [task.id, task]))
  const affiliateByTool = new Map(affiliateRows.map((row) => [row.toolId, row]))
  const fitsByTool = new Map<number, FitRow[]>()
  for (const fit of fitRows) {
    const list = fitsByTool.get(fit.toolId)
    if (list) list.push(fit)
    else fitsByTool.set(fit.toolId, [fit])
  }
  return rows.map((row) => toolRecord(row, fitsByTool.get(row.id) ?? [], taskById, affiliateByTool.get(row.id)))
}

export async function readToolsBySlugs(db: Database, slugs: string[]): Promise<CatalogTool[]> {
  const unique = [...new Set(slugs)]
  if (unique.length === 0) return []
  const rows = await db
    .select()
    .from(tools)
    .where(and(eq(tools.status, 'active'), inArray(tools.slug, unique)))
  const hydrated = await hydrateTools(db, rows)
  const bySlug = new Map(hydrated.map((tool) => [tool.slug, tool]))
  return slugs.flatMap((slug) => {
    const tool = bySlug.get(slug)
    return tool ? [tool] : []
  })
}

export async function readTasks(db: Database): Promise<CatalogTask[]> {
  const rows = await db
    .select({
      slug: tasks.slug,
      name: tasks.name,
      category: tasks.category,
      description: tasks.description,
    })
    .from(tasks)
    .orderBy(asc(tasks.name))
  return rows
}

export async function readToolCategoryCounts(db: Database): Promise<{ category: string; total: number }[]> {
  const rows = await db
    .select({ category: tools.category, total: count() })
    .from(tools)
    .where(eq(tools.status, 'active'))
    .groupBy(tools.category)
  return rows.map((row) => ({ category: row.category, total: Number(row.total) }))
}

export async function readToolPage(db: Database, page: number, category: string | null = null): Promise<ToolPage> {
  const requested = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const where = category ? and(eq(tools.status, 'active'), eq(tools.category, category)) : eq(tools.status, 'active')
  const [countRow] = await db.select({ total: count() }).from(tools).where(where)
  const total = Number(countRow?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / TOOLS_PAGE_SIZE))
  const current = Math.min(requested, pageCount)
  const rows = await db
    .select({
      slug: tools.slug,
      name: tools.name,
      vendor: tools.vendor,
      category: tools.category,
      shortDesc: tools.shortDesc,
    })
    .from(tools)
    .where(where)
    .orderBy(asc(tools.name))
    .limit(TOOLS_PAGE_SIZE)
    .offset((current - 1) * TOOLS_PAGE_SIZE)
  return { tools: rows, total, page: current, pageSize: TOOLS_PAGE_SIZE, pageCount }
}

export async function readTaskCandidates(
  db: Database,
  taskSlug: string,
): Promise<{ task: CatalogTask; tools: TaskCandidate[] } | null> {
  const [task] = await db
    .select({
      slug: tasks.slug,
      name: tasks.name,
      category: tasks.category,
      description: tasks.description,
      id: tasks.id,
    })
    .from(tasks)
    .where(eq(tasks.slug, taskSlug))
    .limit(1)
  if (!task) return null
  const rows = await db
    .select({
      slug: tools.slug,
      name: tools.name,
      shortDesc: tools.shortDesc,
      skillLevel: tools.skillLevel,
      pricingModel: tools.pricingModel,
      hasFreeTier: tools.hasFreeTier,
      priceFromUsd: tools.priceFromUsd,
      lastVerifiedAt: tools.lastVerifiedAt,
      fitScore: toolTasks.fitScore,
      notes: toolTasks.notes,
    })
    .from(toolTasks)
    .innerJoin(tools, eq(tools.id, toolTasks.toolId))
    .where(and(eq(toolTasks.taskId, task.id), eq(tools.status, 'active')))

  const candidates: TaskCandidate[] = rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    shortDesc: row.shortDesc,
    skillLevel: skillSchema.parse(row.skillLevel) as Skill,
    pricingModel: pricingSchema.parse(row.pricingModel) as PricingModel,
    hasFreeTier: row.hasFreeTier,
    priceFromUsd: row.priceFromUsd,
    lastVerifiedAt: row.lastVerifiedAt,
    fitScore: row.fitScore,
    notes: row.notes,
  }))
  candidates.sort((a, b) => b.fitScore - a.fitScore || a.name.localeCompare(b.name))
  return {
    task: { slug: task.slug, name: task.name, category: task.category, description: task.description },
    tools: candidates,
  }
}

export async function scoreQuiz(db: Database, answers: QuizAnswers) {
  const loaded = await readTaskCandidates(db, answers.task)
  if (!loaded || loaded.tools.length === 0) return null
  const picks = selectQuizPicks(loaded.tools, answers)
  const leader = picks[0]
  const matchCount = listMatches(loaded.tools, answers.budget).length
  return { task: loaded.task, picks, answers, why: leader ? leader.reason : '', matchCount }
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export async function searchToolSummaries(db: Database, query: string): Promise<ToolSummary[]> {
  const pattern = likePattern(query)
  const [direct, viaTask] = await Promise.all([
    db
      .select({ id: tools.id })
      .from(tools)
      .where(
        and(
          eq(tools.status, 'active'),
          sql`(${tools.name} LIKE ${pattern} ESCAPE '\\' OR ${tools.vendor} LIKE ${pattern} ESCAPE '\\' OR ${tools.category} LIKE ${pattern} ESCAPE '\\' OR ${tools.shortDesc} LIKE ${pattern} ESCAPE '\\')`,
        ),
      ),
    db
      .select({ id: tools.id })
      .from(tools)
      .innerJoin(toolTasks, eq(toolTasks.toolId, tools.id))
      .innerJoin(tasks, eq(tasks.id, toolTasks.taskId))
      .where(and(eq(tools.status, 'active'), sql`${tasks.name} LIKE ${pattern} ESCAPE '\\'`)),
  ])
  const ids = [...new Set([...direct, ...viaTask].map((row) => row.id))].slice(0, 200)
  if (ids.length === 0) return []
  return db
    .select({
      slug: tools.slug,
      name: tools.name,
      vendor: tools.vendor,
      category: tools.category,
      shortDesc: tools.shortDesc,
    })
    .from(tools)
    .where(inArray(tools.id, ids))
    .orderBy(asc(tools.name))
    .limit(SEARCH_LIMIT)
}

export async function readPublicSlugs(db: Database): Promise<{ tasks: string[]; tools: string[] }> {
  const [taskRows, toolRows] = await Promise.all([
    db.select({ slug: tasks.slug }).from(tasks).orderBy(asc(tasks.name)),
    db.select({ slug: tools.slug }).from(tools).where(eq(tools.status, 'active')).orderBy(asc(tools.name)),
  ])
  return { tasks: taskRows.map((row) => row.slug), tools: toolRows.map((row) => row.slug) }
}

export async function readToolSummaries(db: Database): Promise<Array<ToolSummary & { shortDesc: string }>> {
  return db
    .select({
      slug: tools.slug,
      name: tools.name,
      vendor: tools.vendor,
      category: tools.category,
      shortDesc: tools.shortDesc,
    })
    .from(tools)
    .where(eq(tools.status, 'active'))
    .orderBy(asc(tools.name))
}
