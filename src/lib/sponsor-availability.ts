import { placementWindowMs } from './best-placement'
import type { Database } from './db/client'
import { FOUNDING_SOLD_OUT, FOUNDING_SPONSOR_CAP, isSubscriptionOffering, isTaskOffering } from './sponsor-offerings'

/** Stripe Checkout expires after 24 hours. A claim older than that can be taken. */
export const SPONSOR_CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000

export const SPONSOR_SLOT_TAKEN = 'That task page already has a placement in this period. Choose another page.'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/** Largest Date value. A renewing subscription has no fixed end, so it holds the task until here. */
export const OPEN_ENDED_MS = 8_640_000_000_000_000

export type SponsorSlotClaim = {
  taskSlug: string
  offering: string
  requestKey: string
  now: number
}

/**
 * Hold a task page for one checkout. One statement inserts or takes over an
 * expired claim, and only when no paid unrefunded window overlaps the new
 * placement. A second request for a live claim changes nothing.
 *
 * A subscription (new or existing) has no fixed end while it is renewing:
 * active, trialing, or past_due, with no cancellation scheduled. It holds the
 * task open-ended. A subscription with a scheduled cancel, or one that ended,
 * holds the task until paid_through. A new subscription checkout overlaps any
 * paid placement on the task that has not ended yet.
 *
 * The founding offer is also capped at FOUNDING_SPONSOR_CAP in the same
 * statement, so two concurrent checkouts cannot both take the last spot.
 */
export async function claimSponsorSlot(
  db: Database,
  input: SponsorSlotClaim,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isTaskOffering(input.offering)) return { ok: true }
  const windowMs = isSubscriptionOffering(input.offering) ? null : placementWindowMs(input.offering)
  const newEnd = windowMs == null ? OPEN_ENDED_MS : input.now + windowMs
  const founding = input.offering === 'founding_sponsor'
  const claimed = await db.$client.execute({
    sql: `INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM sponsorships
        WHERE task_slug = ?
          AND status = 'paid'
          AND refunded_at IS NULL
          AND paid_at IS NOT NULL
          AND offering IN ('placement_weekly', 'placement_monthly', 'placement_subscription', 'founding_sponsor')
          AND paid_at < ?
          AND ? < CASE offering
            WHEN 'placement_weekly' THEN paid_at + ?
            WHEN 'placement_monthly' THEN paid_at + ?
            ELSE CASE
              WHEN canceled_at IS NULL
                AND cancel_at IS NULL
                AND coalesce(subscription_status, '') IN ('active', 'trialing', 'past_due')
              THEN ?
              ELSE coalesce(paid_through, 0)
            END
          END
      )
      AND (? = 0 OR (${FOUNDING_TAKEN_SQL}) < ?)
      ON CONFLICT(task_slug) DO UPDATE SET
        request_key = excluded.request_key,
        offering = excluded.offering,
        claimed_at = excluded.claimed_at
      WHERE sponsorship_slot_claims.request_key = excluded.request_key
         OR sponsorship_slot_claims.claimed_at <= ?
      RETURNING task_slug`,
    args: [
      input.taskSlug,
      input.requestKey,
      input.offering,
      input.now,
      input.taskSlug,
      newEnd,
      input.now,
      WEEK_MS,
      MONTH_MS,
      OPEN_ENDED_MS,
      founding ? 1 : 0,
      input.now - SPONSOR_CHECKOUT_EXPIRY_MS,
      input.taskSlug,
      FOUNDING_SPONSOR_CAP,
      input.now - SPONSOR_CHECKOUT_EXPIRY_MS,
    ],
  })
  if (claimed.rows.length > 0) return { ok: true }
  if (founding && (await foundingSpotsTaken(db, input.now, input.taskSlug)) >= FOUNDING_SPONSOR_CAP) {
    return { ok: false, message: FOUNDING_SOLD_OUT }
  }
  return { ok: false, message: SPONSOR_SLOT_TAKEN }
}

/**
 * Founding spots in use: every paid, unrefunded founding sponsorship (a
 * canceled one still counts, so there are only ever 5 founding sponsors), plus
 * founding checkout holds younger than the Checkout expiry whose task has no
 * paid founding row yet (a paid row and its own hold count once). The hold on
 * excludeTask is left out, because a new claim on that task replaces it.
 */
const FOUNDING_TAKEN_SQL = `
  (SELECT count(*) FROM sponsorships
    WHERE offering = 'founding_sponsor' AND status = 'paid' AND refunded_at IS NULL)
  + (SELECT count(*) FROM sponsorship_slot_claims AS hold
    WHERE hold.offering = 'founding_sponsor'
      AND hold.claimed_at > ?
      AND hold.task_slug != ?
      AND NOT EXISTS (
        SELECT 1 FROM sponsorships AS paid
        WHERE paid.task_slug = hold.task_slug
          AND paid.offering = 'founding_sponsor'
          AND paid.status = 'paid'
          AND paid.refunded_at IS NULL
      ))`

export async function foundingSpotsTaken(db: Database, now: number, excludeTask = ''): Promise<number> {
  const result = await db.$client.execute({
    sql: `SELECT ${FOUNDING_TAKEN_SQL} AS taken`,
    args: [now - SPONSOR_CHECKOUT_EXPIRY_MS, excludeTask],
  })
  return Number(result.rows[0]?.taken ?? 0)
}

/** Founding spots still open, never below zero. */
export async function foundingSpotsLeft(db: Database, now: number): Promise<number> {
  return Math.max(0, FOUNDING_SPONSOR_CAP - (await foundingSpotsTaken(db, now)))
}

/** Drop this request's hold after Checkout fails. Another request's hold stays. */
export async function releaseSponsorSlot(
  db: Database,
  input: { taskSlug: string; requestKey: string },
): Promise<void> {
  await db.$client.execute({
    sql: `UPDATE sponsorship_slot_claims
      SET claimed_at = 0
      WHERE task_slug = ? AND request_key = ?`,
    args: [input.taskSlug, input.requestKey],
  })
}
