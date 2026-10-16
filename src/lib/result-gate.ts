import { isDeadline, withDeadline } from './deadline'

/** First catalog read. A slow database must not hold the gate longer than this. */
export const RESULT_GATE_BUDGET_MS = 800

/** Second read, the one the page would do. Long enough for a cold catalog query. */
export const RESULT_PAGE_LOOKUP_BUDGET_MS = 3_000

/** Limiter decision. The shared write is not awaited inside this budget. */
export const RESULT_LIMIT_BUDGET_MS = 3_000

export type ResultGateDecision =
  | { type: 'not-found' }
  | { type: 'limited'; resetAt: number }
  | { type: 'continue' }
  | { type: 'unavailable' }

/**
 * /result is classified here before the page renders.
 * A cached task-slug set answers immediately. There is no second read.
 * Without that cache, a catalog lookup that throws or exceeds 800ms is tried
 * again with the same read the page uses, with about 3s. A miss is a real 404.
 * If that second read times out, render the page. Its own read decides.
 * A valid quiz must not 503 because the database is slow.
 * If that second read throws, the database is unreachable: answer 503 and do
 * not render. Rendering would be a 500, and notFound() would add a second robots meta.
 * The limiter decision is the callback's result. Callers must not wait on the
 * shared write inside that callback: a stuck write must not hide a result the
 * catalog already found. The in-process counter still rejects a burst.
 */
export async function decideResultGate(input: {
  view: string
  lookup: () => Promise<'not-found' | 'ok'>
  pageLookup: () => Promise<'not-found' | 'ok'>
  limit: () => Promise<{ ok: boolean; resetAt: number }>
  cachedStatus?: 'not-found' | 'ok'
  lookupBudgetMs?: number
  pageLookupBudgetMs?: number
  limitBudgetMs?: number
}): Promise<ResultGateDecision> {
  const lookupBudgetMs = input.lookupBudgetMs ?? RESULT_GATE_BUDGET_MS
  const pageLookupBudgetMs = input.pageLookupBudgetMs ?? RESULT_PAGE_LOOKUP_BUDGET_MS
  const limitBudgetMs = input.limitBudgetMs ?? RESULT_LIMIT_BUDGET_MS
  let status: 'not-found' | 'ok'
  if (input.cachedStatus) {
    status = input.cachedStatus
  } else {
    try {
      status = await withDeadline(input.lookup(), lookupBudgetMs)
    } catch (error) {
      console.error('result lookup failed', error instanceof Error ? error.name : 'error')
      try {
        status = await withDeadline(input.pageLookup(), pageLookupBudgetMs)
      } catch (pageError) {
        if (isDeadline(pageError)) {
          console.error('result page lookup timed out')
          return { type: 'continue' }
        }
        console.error('result page lookup failed', pageError instanceof Error ? pageError.name : 'error')
        return { type: 'unavailable' }
      }
    }
  }
  if (status === 'not-found') return { type: 'not-found' }
  if (input.view !== '') return { type: 'continue' }
  try {
    const limited = await withDeadline(input.limit(), limitBudgetMs)
    if (limited.ok) return { type: 'continue' }
    return { type: 'limited', resetAt: limited.resetAt }
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return { type: 'continue' }
  }
}
