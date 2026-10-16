import { readTaskCandidates } from './catalog-read'
import { cachedTaskSlugs, type Database } from './db/client'
import { listMatches, matchesPageRequest, pageOfMatches } from './matches'
import { firstString, matchBudgetSchema, slugSchema } from './validation'

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
 * 404s that do not need the catalog. `lookup` still has to read the database.
 * A quiz with no task and a valid (or empty) budget stays on the form.
 * An invalid task slug or budget is a 404, the same as view=all.
 */
export function resultOfflineStatus(params: URLSearchParams): 'not-found' | 'ok' | 'lookup' {
  const view = params.get('view') ?? ''
  if (view !== '' && view !== 'all') return 'not-found'
  const task = params.get('task') ?? ''
  const budget = params.get('budget') ?? ''
  if (view === 'all') {
    if (!slugSchema.safeParse(task).success) return 'not-found'
    if (budget !== '' && !matchBudgetSchema.safeParse(budget).success) return 'not-found'
    return 'lookup'
  }
  if (task !== '' && !slugSchema.safeParse(task).success) return 'not-found'
  if (budget !== '' && !matchBudgetSchema.safeParse(budget).success) return 'not-found'
  if (task === '') return 'ok'
  return 'lookup'
}

/**
 * Quiz URLs with a missing skill stay on the form (200).
 * An invalid task or budget is a 404. A well-formed task that is not in the catalog is a 404.
 */
export async function resultRequestStatus(db: Database, params: URLSearchParams): Promise<'not-found' | 'ok'> {
  const offline = resultOfflineStatus(params)
  if (offline !== 'lookup') return offline
  if ((params.get('view') ?? '') === 'all') return (await allMatchesRequest(db, params)) ? 'ok' : 'not-found'
  const task = params.get('task') ?? ''
  const slugs = await cachedTaskSlugs(db)
  return slugs.has(task) ? 'ok' : 'not-found'
}
