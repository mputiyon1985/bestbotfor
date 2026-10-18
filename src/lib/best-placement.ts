import { and, eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { approvedCardsForSponsorships, type PublicSponsorCard } from './sponsor-card'
import { sanitizeSponsorCompany } from './sponsor-company'
import { isSubscriptionOffering, type TaskSponsorOfferingId } from './sponsor-offerings'

/** Visible label for a /best placement that comes from an active sponsorship. */
export const SPONSORED_LABEL = 'Sponsored'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS

/**
 * A renewal invoice is created at the period end and is usually paid within
 * about an hour. While Stripe still reports the subscription as active or
 * trialing, with no cancellation scheduled, the card keeps showing for this
 * long past paid_through so a renewal does not blink the placement off. A
 * failed renewal (past_due), a scheduled cancel, or a cancel ends it at
 * paid_through.
 */
export const SUBSCRIPTION_RENEWAL_GRACE_MS = 3 * DAY_MS

/** Statuses during which a sponsor subscription is expected to renew. */
const RENEWING_STATUSES = new Set(['active', 'trialing'])

export type SponsorshipPlacementRow = {
  id?: number
  offering: string
  status: string
  taskSlug: string | null
  company: string | null
  paidAt: number | null
  refundedAt: number | null
  /** Subscription rows only. */
  paidThrough?: number | null
  subscriptionStatus?: string | null
  cancelAt?: number | null
  canceledAt?: number | null
  card?: PublicSponsorCard | null
}

export type ActiveBestPlacement = {
  label: typeof SPONSORED_LABEL
  company: string | null
  offering: TaskSponsorOfferingId
  sponsorshipId: number
  card: PublicSponsorCard
}

/** Paid window for a /best placement. Newsletter slots are not guide placements. */
export function placementWindowMs(offering: string): number | null {
  if (offering === 'placement_weekly') return WEEK_MS
  if (offering === 'placement_monthly') return MONTH_MS
  return null
}

export type PlacementWindowRow = Pick<
  SponsorshipPlacementRow,
  'offering' | 'paidAt' | 'paidThrough' | 'subscriptionStatus' | 'cancelAt' | 'canceledAt'
>

/**
 * End of the paid window, ms, or null when the row is not a /best placement or
 * has no paid window. One-time rows end a week or a month after paidAt.
 * Subscription rows end at paidThrough, which invoice.paid moves forward each
 * renewal, plus the renewal grace while the subscription is still renewing.
 */
export function placementEndsAt(row: PlacementWindowRow): number | null {
  const start = row.paidAt
  if (start == null || !Number.isFinite(start)) return null
  const windowMs = placementWindowMs(row.offering)
  if (windowMs != null) return start + windowMs
  if (!isSubscriptionOffering(row.offering)) return null
  const through = row.paidThrough
  if (through == null || !Number.isFinite(through)) return null
  const renewing =
    RENEWING_STATUSES.has(row.subscriptionStatus ?? '') && row.canceledAt == null && row.cancelAt == null
  return renewing ? through + SUBSCRIPTION_RENEWAL_GRACE_MS : through
}

/** True when now is inside the row's paid window (start inclusive, end exclusive). */
export function placementActiveAt(row: PlacementWindowRow, now: number): boolean {
  const start = row.paidAt
  const end = placementEndsAt(row)
  if (start == null || end == null || !Number.isFinite(now)) return false
  return now >= start && now < end
}

/**
 * The placement shown on one /best page. Only a paid weekly, monthly, or
 * subscription sponsorship for that task, not refunded, still inside its paid
 * window (placementEndsAt), and carrying an admin-approved tool card, qualifies.
 * paidAt is the first time the row became paid. A pending or rejected card
 * does not display.
 */
export function activeBestPlacement(
  rows: SponsorshipPlacementRow[],
  taskSlug: string,
  now: number,
): ActiveBestPlacement | null {
  const matches = rows.filter((row) => {
    if (typeof row.id !== 'number' || row.status !== 'paid' || row.taskSlug !== taskSlug || row.refundedAt != null || !row.card) return false
    return placementActiveAt(row, now)
  })
  matches.sort((left, right) => (right.paidAt ?? 0) - (left.paidAt ?? 0))
  const current = matches[0]
  if (!current?.card || typeof current.id !== 'number') return null
  const company = sanitizeSponsorCompany(current.company ?? '')
  return {
    label: SPONSORED_LABEL,
    company: company.length > 0 ? company : null,
    offering: taskOfferingOf(current.offering),
    sponsorshipId: current.id,
    card: current.card,
  }
}

function taskOfferingOf(offering: string): TaskSponsorOfferingId {
  if (offering === 'placement_monthly' || offering === 'founding_sponsor' || offering === 'placement_subscription') {
    return offering
  }
  return 'placement_weekly'
}

export async function activeBestPlacementForTask(
  db: Database,
  taskSlug: string,
  now = Date.now(),
): Promise<ActiveBestPlacement | null> {
  const rows = await db
    .select({
      id: sponsorships.id,
      offering: sponsorships.offering,
      status: sponsorships.status,
      taskSlug: sponsorships.taskSlug,
      company: sponsorships.company,
      paidAt: sponsorships.paidAt,
      refundedAt: sponsorships.refundedAt,
      paidThrough: sponsorships.paidThrough,
      subscriptionStatus: sponsorships.subscriptionStatus,
      cancelAt: sponsorships.cancelAt,
      canceledAt: sponsorships.canceledAt,
    })
    .from(sponsorships)
    .where(and(eq(sponsorships.taskSlug, taskSlug), eq(sponsorships.status, 'paid')))
  const cards = await approvedCardsForSponsorships(
    db,
    rows.map((row) => row.id),
  )
  return activeBestPlacement(
    rows.map((row) => ({ ...row, card: cards.get(row.id) ?? null })),
    taskSlug,
    now,
  )
}

/**
 * /best calls this so a sponsorship read cannot take down the guide.
 * The log is the error name only. Company names and emails are not logged.
 */
export async function readActiveBestPlacement(
  open: () => Database,
  taskSlug: string,
  now = Date.now(),
): Promise<ActiveBestPlacement | null> {
  try {
    return await activeBestPlacementForTask(open(), taskSlug, now)
  } catch (error) {
    console.error('best placement lookup failed', error instanceof Error ? error.name : 'error')
    return null
  }
}
