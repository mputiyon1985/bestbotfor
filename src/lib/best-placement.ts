import { and, eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { sanitizeSponsorCompany } from './sponsor-company'

/** Visible label for a /best placement that comes from an active sponsorship. */
export const SPONSORED_LABEL = 'Sponsored'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS

export type SponsorshipPlacementRow = {
  offering: string
  status: string
  taskSlug: string | null
  company: string | null
  paidAt: number | null
  refundedAt: number | null
}

export type ActiveBestPlacement = {
  label: typeof SPONSORED_LABEL
  company: string | null
  offering: 'placement_weekly' | 'placement_monthly'
}

/** Paid window for a /best placement. Newsletter slots are not guide placements. */
export function placementWindowMs(offering: string): number | null {
  if (offering === 'placement_weekly') return WEEK_MS
  if (offering === 'placement_monthly') return MONTH_MS
  return null
}

/**
 * The placement shown on one /best page. Only a paid weekly or monthly
 * sponsorship for that task, not refunded, still inside the window that
 * starts at paidAt, qualifies. paidAt is the first time the row became paid.
 */
export function activeBestPlacement(
  rows: SponsorshipPlacementRow[],
  taskSlug: string,
  now: number,
): ActiveBestPlacement | null {
  const matches = rows.filter((row) => {
    if (row.status !== 'paid' || row.taskSlug !== taskSlug || row.refundedAt != null) return false
    const windowMs = placementWindowMs(row.offering)
    const start = row.paidAt
    if (windowMs == null || start == null || !Number.isFinite(start) || !Number.isFinite(now)) return false
    return now >= start && now < start + windowMs
  })
  matches.sort((left, right) => (right.paidAt ?? 0) - (left.paidAt ?? 0))
  const current = matches[0]
  if (!current) return null
  const company = sanitizeSponsorCompany(current.company ?? '')
  return {
    label: SPONSORED_LABEL,
    company: company.length > 0 ? company : null,
    offering: current.offering === 'placement_monthly' ? 'placement_monthly' : 'placement_weekly',
  }
}

export async function activeBestPlacementForTask(
  db: Database,
  taskSlug: string,
  now = Date.now(),
): Promise<ActiveBestPlacement | null> {
  const rows = await db
    .select({
      offering: sponsorships.offering,
      status: sponsorships.status,
      taskSlug: sponsorships.taskSlug,
      company: sponsorships.company,
      paidAt: sponsorships.paidAt,
      refundedAt: sponsorships.refundedAt,
    })
    .from(sponsorships)
    .where(and(eq(sponsorships.taskSlug, taskSlug), eq(sponsorships.status, 'paid')))
  return activeBestPlacement(rows, taskSlug, now)
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
