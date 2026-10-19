import { eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { tasks, toolScores, toolTasks, tools } from './db/schema'

/**
 * Stable lastmod for sitemap pages that carry no catalog review date of their
 * own (about, privacy, pricing, and so on). It is a fixed content date, not the
 * build or request time, so the sitemap does not claim every page changed on
 * each deploy. Move it forward when those pages are edited.
 */
export const SITEMAP_STATIC_LASTMOD = '2026-10-19'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The latest valid YYYY-MM-DD date in the list, or null when there is none. */
export function latestIsoDate(dates: ReadonlyArray<string | null | undefined>): string | null {
  let latest: string | null = null
  for (const date of dates) {
    if (!date || !ISO_DATE.test(date)) continue
    if (latest === null || date > latest) latest = date
  }
  return latest
}

export type SitemapDates = {
  /** Tool slug to the later of last_verified_at and the editorial reviewed_at. */
  tools: Map<string, string>
  /** Task slug to the latest review date among its active tools. */
  tasks: Map<string, string>
  /** Latest review date in the whole catalog. */
  catalog: string | null
}

/** Read-only: collects the catalog's reviewed dates for sitemap lastmod. */
export async function readSitemapDates(db: Database): Promise<SitemapDates> {
  const [toolRows, fitRows] = await Promise.all([
    db
      .select({ slug: tools.slug, verified: tools.lastVerifiedAt, reviewed: toolScores.reviewedAt })
      .from(tools)
      .leftJoin(toolScores, eq(toolScores.toolId, tools.id))
      .where(eq(tools.status, 'active')),
    db
      .select({ task: tasks.slug, tool: tools.slug })
      .from(toolTasks)
      .innerJoin(tasks, eq(tasks.id, toolTasks.taskId))
      .innerJoin(tools, eq(tools.id, toolTasks.toolId))
      .where(eq(tools.status, 'active')),
  ])
  const toolDates = new Map<string, string>()
  for (const row of toolRows) {
    const date = latestIsoDate([row.verified, row.reviewed])
    if (date) toolDates.set(row.slug, date)
  }
  const taskDates = new Map<string, string>()
  for (const row of fitRows) {
    const date = latestIsoDate([taskDates.get(row.task), toolDates.get(row.tool)])
    if (date) taskDates.set(row.task, date)
  }
  return { tools: toolDates, tasks: taskDates, catalog: latestIsoDate([...toolDates.values()]) }
}

export function emptySitemapDates(): SitemapDates {
  return { tools: new Map(), tasks: new Map(), catalog: null }
}
