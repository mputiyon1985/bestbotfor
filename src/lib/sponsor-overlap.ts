import { eq } from 'drizzle-orm'
import type { Database } from './db'
import { sponsorships } from './db/schema'
import { placementActiveAt } from './best-placement'
import { SPONSOR_CONTACT_EMAIL } from './sponsor-checkout-gate'
import { isTaskOffering } from './sponsor-offerings'

/**
 * Log tag when a paid /best checkout lands on a page that already has an
 * active placement. Search the runtime logs for it. /admin/sponsors shows
 * the same tasks under "Placement already taken".
 */
export const PLACEMENT_OVERLAP_ALERT_TAG = 'PLACEMENT SLOT TAKEN'

export type PlacementOverlap = {
  taskSlug: string
  sessionIds: string[]
}

type ActivePlacement = {
  sessionId: string
  taskSlug: string
  offering: string
  paidAt: number | null
  paidThrough: number | null
  subscriptionStatus: string | null
  cancelAt: number | null
  canceledAt: number | null
  refundedAt: number | null
  status: string
}

/**
 * Alert that a completed placement took a page that already had one. No mail
 * transport, so this is one error log plus the admin list. It logs session
 * ids and the task only, never the buyer's email. Nothing is refunded.
 */
export function alertPlacementOverlap(input: { sessionId: string; taskSlug: string; otherSessionIds: string[] }): void {
  console.error(
    PLACEMENT_OVERLAP_ALERT_TAG,
    JSON.stringify({
      session: input.sessionId,
      task: input.taskSlug,
      other_sessions: input.otherSessionIds,
      action: 'not refunded; Mark decides refund or honor; see /admin/sponsors',
      to: SPONSOR_CONTACT_EMAIL,
    }),
  )
}

function activeRows(rows: ActivePlacement[], now: number): ActivePlacement[] {
  return rows.filter((row) => {
    if (row.status !== 'paid' || row.refundedAt != null || !row.taskSlug || !isTaskOffering(row.offering)) return false
    return placementActiveAt(row, now)
  })
}

/** Tasks whose paid window currently holds more than one sponsorship. */
export function placementOverlaps(rows: ActivePlacement[], now: number): PlacementOverlap[] {
  const byTask = new Map<string, string[]>()
  for (const row of activeRows(rows, now)) {
    const list = byTask.get(row.taskSlug) ?? []
    list.push(row.sessionId)
    byTask.set(row.taskSlug, list)
  }
  return [...byTask.entries()]
    .filter((entry) => entry[1].length > 1)
    .map(([taskSlug, sessionIds]) => ({ taskSlug, sessionIds: [...sessionIds].sort() }))
    .sort((left, right) => left.taskSlug.localeCompare(right.taskSlug))
}

async function paidPlacementRows(db: Database): Promise<ActivePlacement[]> {
  const rows = await db
    .select({
      sessionId: sponsorships.stripeCheckoutSessionId,
      taskSlug: sponsorships.taskSlug,
      offering: sponsorships.offering,
      paidAt: sponsorships.paidAt,
      paidThrough: sponsorships.paidThrough,
      subscriptionStatus: sponsorships.subscriptionStatus,
      cancelAt: sponsorships.cancelAt,
      canceledAt: sponsorships.canceledAt,
      refundedAt: sponsorships.refundedAt,
      status: sponsorships.status,
    })
    .from(sponsorships)
    .where(eq(sponsorships.status, 'paid'))
  return rows.flatMap((row) => (row.taskSlug ? [{ ...row, taskSlug: row.taskSlug }] : []))
}

export async function listPlacementOverlaps(db: Database, now = Date.now()): Promise<PlacementOverlap[]> {
  return placementOverlaps(await paidPlacementRows(db), now)
}

/**
 * After a paid task checkout is stored. Founding over-cap is a separate
 * recount. This flags a second live placement on the same page. A failed
 * read is logged and does not fail the webhook: the payment is already recorded.
 */
export async function flagPlacementOverlap(
  db: Database,
  input: { sessionId: string; taskSlug: string | null; offeringId: string; now: number },
): Promise<void> {
  if (!input.taskSlug || !isTaskOffering(input.offeringId)) return
  try {
    const overlaps = placementOverlaps(await paidPlacementRows(db), input.now).find((overlap) => overlap.taskSlug === input.taskSlug)
    if (!overlaps) return
    const others = overlaps.sessionIds.filter((id) => id !== input.sessionId)
    if (others.length === 0) return
    alertPlacementOverlap({ sessionId: input.sessionId, taskSlug: input.taskSlug, otherSessionIds: others })
  } catch (error) {
    console.error('placement overlap check failed', input.sessionId, error instanceof Error ? error.name : 'error')
  }
}
