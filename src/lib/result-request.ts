import { eq } from 'drizzle-orm'
import { readTaskCandidates } from './catalog-read'
import type { Database } from './db/client'
import { tasks } from './db/schema'
import { listMatches, matchesPageRequest, pageOfMatches } from './matches'
import { firstString, matchBudgetSchema, quizSchema, slugSchema } from './validation'

export function searchParamsToUrl(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = firstString(value)
    if (first) out.set(key, first)
  }
  return out
}

/** All-matches page, or null when the task, budget, or page should 404. */
export async function allMatchesRequest(db: Database, params: URLSearchParams) {
  const taskSlug = params.get('task') ?? ''
  if (!slugSchema.safeParse(taskSlug).success) return null
  const rawBudget = params.get('budget') ?? ''
  const parsedBudget = rawBudget === '' ? { success: true as const, data: 'any' as const } : matchBudgetSchema.safeParse(rawBudget)
  if (!parsedBudget.success) return null
  const loaded = await readTaskCandidates(db, taskSlug)
  if (!loaded) return null
  const matches = listMatches(loaded.tools, parsedBudget.data)
  const requested = matchesPageRequest(params.get('page') ?? '', matches.length)
  if (!requested) return null
  return {
    task: loaded.task,
    budget: parsedBudget.data,
    total: matches.length,
    tools: pageOfMatches(matches, requested.page),
    page: requested.page,
    pageCount: requested.pageCount,
  }
}

/**
 * Quiz URLs with a bad or missing answer stay on the form (200).
 * A well-formed task that is not in the catalog is missing.
 */
export async function quizTaskStatus(db: Database, params: URLSearchParams): Promise<'invalid' | 'missing' | 'present'> {
  const parsed = quizSchema.safeParse({
    task: params.get('task') ?? '',
    budget: params.get('budget') ?? '',
    skill: params.get('skill') ?? '',
  })
  if (!parsed.success) return 'invalid'
  const [task] = await db.select({ slug: tasks.slug }).from(tasks).where(eq(tasks.slug, parsed.data.task)).limit(1)
  return task ? 'present' : 'missing'
}

/** Whether this /result URL should be a 404 before the page renders. */
export async function resultRequestStatus(db: Database, params: URLSearchParams): Promise<'not-found' | 'ok'> {
  const view = params.get('view') ?? ''
  if (view !== '' && view !== 'all') return 'not-found'
  if (view === 'all') return (await allMatchesRequest(db, params)) ? 'ok' : 'not-found'
  return (await quizTaskStatus(db, params)) === 'missing' ? 'not-found' : 'ok'
}
