import { withDeadline } from './deadline'

/** Catalog lookup and the quiz rate-limit write both give up after this. */
export const RESULT_GATE_BUDGET_MS = 800

export type ResultGateDecision =
  | { type: 'not-found' }
  | { type: 'limited'; resetAt: number }
  | { type: 'continue' }
  | { type: 'unavailable' }

/**
 * /result is classified here before the page renders.
 * A catalog lookup that throws or exceeds the budget is tried again with the
 * same read the page uses. A miss is a real 404. If that read also throws or
 * times out, the database is still down at render time: answer 503 and do not
 * render. Rendering would be a 500, and notFound() would add a second robots meta.
 * 503 is not a 404. An outage does not mean the task is missing, and match lists
 * are indexable. A rate-limit failure still continues, so a slow limiter does
 * not hide a result the catalog already found.
 */
export async function decideResultGate(input: {
  view: string
  lookup: () => Promise<'not-found' | 'ok'>
  pageLookup: () => Promise<'not-found' | 'ok'>
  limit: () => Promise<{ ok: boolean; resetAt: number }>
  deadlineMs?: number
}): Promise<ResultGateDecision> {
  const deadlineMs = input.deadlineMs ?? RESULT_GATE_BUDGET_MS
  let status: 'not-found' | 'ok'
  try {
    status = await withDeadline(input.lookup(), deadlineMs)
  } catch (error) {
    console.error('result lookup failed', error instanceof Error ? error.name : 'error')
    try {
      status = await withDeadline(input.pageLookup(), deadlineMs)
    } catch (pageError) {
      console.error('result page lookup failed', pageError instanceof Error ? pageError.name : 'error')
      return { type: 'unavailable' }
    }
  }
  if (status === 'not-found') return { type: 'not-found' }
  if (input.view !== '') return { type: 'continue' }
  try {
    const limited = await withDeadline(input.limit(), deadlineMs)
    if (limited.ok) return { type: 'continue' }
    return { type: 'limited', resetAt: limited.resetAt }
  } catch (error) {
    console.error('rate limit failed', error instanceof Error ? error.name : 'error')
    return { type: 'continue' }
  }
}
