import { OG_DB_BUDGET_MS } from './og'
import { withDeadline } from './deadline'

export type OgGate = 'allow' | 'limit'

/**
 * Preview generation is expensive. A database error or a slow write must not
 * hang the response or turn the card into a 503, so this fails open.
 */
export async function gateOgRequest(
  limit: Promise<{ ok: boolean; remaining: number }>,
  budgetMs = OG_DB_BUDGET_MS,
): Promise<OgGate> {
  try {
    const result = await withDeadline(limit, budgetMs)
    return result.ok ? 'allow' : 'limit'
  } catch (error) {
    console.error('og rate limit failed', error instanceof Error ? error.name : 'error')
    return 'allow'
  }
}
