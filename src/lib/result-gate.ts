import { withDeadline } from './deadline'

/** Catalog lookup and the quiz rate-limit write both give up after this. */
export const RESULT_GATE_BUDGET_MS = 800

export type ResultGateDecision =
  | { type: 'not-found' }
  | { type: 'limited'; resetAt: number }
  | { type: 'continue' }

/**
 * /result is answered here before the page renders. A lookup or rate-limit
 * failure, including a call that takes longer than the budget, continues to
 * the page instead of hanging or returning 503. The page then renders a
 * missing task without calling notFound(), which would add a second robots meta.
 */
export async function decideResultGate(input: {
  view: string
  lookup: () => Promise<'not-found' | 'ok'>
  limit: () => Promise<{ ok: boolean; resetAt: number }>
  deadlineMs?: number
}): Promise<ResultGateDecision> {
  const deadlineMs = input.deadlineMs ?? RESULT_GATE_BUDGET_MS
  try {
    const status = await withDeadline(input.lookup(), deadlineMs)
    if (status === 'not-found') return { type: 'not-found' }
  } catch (error) {
    console.error('result lookup failed', error instanceof Error ? error.name : 'error')
    return { type: 'continue' }
  }
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
