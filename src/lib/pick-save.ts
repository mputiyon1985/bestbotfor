import type { Database } from './db/client'
import { isPaidMembership, type MemberAccess } from './gate'
import { quizSchema, type QuizAnswers } from './validation'

/** Free signed-in accounts stop at this many distinct picks. Paid membership is unlimited. */
export const FREE_PICK_CAP = 10

export const FREE_ACCOUNT_PROMPT = 'Save this pick: free account'

export const PICK_CAP_LEAD = "You've saved 10 picks."

export const PICK_CAP_LINK = 'Go unlimited with membership.'

export type PickSaveDecision =
  | { ok: false; reason: 'unauthenticated' }
  | { ok: true; userId: string; unlimited: boolean }

export type PickSaveOutcome = 'saved' | 'duplicate' | 'limit' | 'busy'

/**
 * A signed-in Clerk user can save. Unlimited is the same paid check as other
 * member features: Stripe is configured and the subscription is active or trialing.
 */
export function evaluatePickSave(input: {
  userId: string | null
  stripeConfigured: boolean
  subscriptionStatus: string | null
}): PickSaveDecision {
  if (!input.userId) return { ok: false, reason: 'unauthenticated' }
  return {
    ok: true,
    userId: input.userId,
    unlimited: isPaidMembership(input),
  }
}

/** The session user is the only id that can save. A paid membership ignores a second id. */
export function pickSaverFromAccess(access: MemberAccess, clerkUserId: string | null): PickSaveDecision {
  const userId = access.allowed ? access.userId : clerkUserId
  return evaluatePickSave({
    userId,
    stripeConfigured: access.allowed,
    subscriptionStatus: access.allowed ? 'active' : null,
  })
}

/**
 * One INSERT…SELECT. SQLite takes the write lock for the whole statement, so the
 * count and the insert cannot race into an 11th free pick. No new column: the
 * cap is the number of rows already stored for that Clerk user.
 */
const INSERT_PICK = `
INSERT INTO saved_picks (clerk_user_id, task_slug, budget, skill, created_at)
SELECT ?, ?, ?, ?, ?
WHERE NOT EXISTS (
  SELECT 1 FROM saved_picks
  WHERE clerk_user_id = ? AND task_slug = ? AND budget = ? AND skill = ?
)
AND (? = 1 OR (SELECT COUNT(*) FROM saved_picks WHERE clerk_user_id = ?) < ?)
`

function isDatabaseBusy(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''
  return code === 'SQLITE_BUSY' || message.includes('SQLITE_BUSY') || message.includes('database is locked')
}

export async function saveCappedPick(input: {
  db: Database
  userId: string
  answers: QuizAnswers
  unlimited: boolean
  now?: number
}): Promise<PickSaveOutcome> {
  if (!input.userId) return 'busy'
  const parsed = quizSchema.parse(input.answers)
  const createdAt = input.now ?? Date.now()
  try {
    const result = await input.db.$client.execute({
      sql: INSERT_PICK,
      args: [
        input.userId,
        parsed.task,
        parsed.budget,
        parsed.skill,
        createdAt,
        input.userId,
        parsed.task,
        parsed.budget,
        parsed.skill,
        input.unlimited ? 1 : 0,
        input.userId,
        FREE_PICK_CAP,
      ],
    })
    if (Number(result.rowsAffected) > 0) return 'saved'
  } catch (error) {
    if (isDatabaseBusy(error)) return 'busy'
    throw error
  }
  const existing = await input.db.$client.execute({
    sql: `SELECT id FROM saved_picks WHERE clerk_user_id = ? AND task_slug = ? AND budget = ? AND skill = ? LIMIT 1`,
    args: [input.userId, parsed.task, parsed.budget, parsed.skill],
  })
  return existing.rows.length > 0 ? 'duplicate' : 'limit'
}
