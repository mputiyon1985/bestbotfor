import { placementWindowMs } from './best-placement'
import { getDb } from './db'
import type { Database } from './db/client'
import { FOUNDING_HOLD_REUSE_MS, SPONSOR_CHECKOUT_EXPIRY_MS } from './sponsor-hold-window'
import { FOUNDING_SOLD_OUT, FOUNDING_SPONSOR_CAP, isSubscriptionOffering, isTaskOffering } from './sponsor-offerings'

export {
  FOUNDING_CHECKOUT_SESSION_MS,
  FOUNDING_HOLD_REUSE_MS,
  SPONSOR_CHECKOUT_EXPIRY_MS,
  foundingCheckoutExpiresAt,
} from './sponsor-hold-window'

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
 *
 * Founding only: a repeat of the same request keeps its hold's original
 * claimed_at while the hold is younger than FOUNDING_HOLD_REUSE_MS (23h20m).
 * It is returned as `claimedAt`; the founding session's expires_at and
 * idempotency key are derived from it, so a retried form sends Stripe the same
 * parameters under the same key, and the hold is not stretched. An older hold
 * is renewed at `now` for the same request, so a new session still gets
 * Stripe's minimum 30 minutes, under a new key. Every other offering
 * refreshes claimed_at on each attempt, as before: their sessions use Stripe's
 * default expiry, which runs from session creation, so a fresh hold clock
 * keeps the hold at least as long as the session.
 *
 * A live founding hold stays a founding hold when the same request switches
 * to another offering (the form keeps one request_id). A founding session may
 * already exist under it, so the hold keeps counting toward the cap of 5, and
 * releaseSponsorSlot keeps leaving it alone, until it expires.
 */
export async function claimSponsorSlot(
  db: Database,
  input: SponsorSlotClaim,
): Promise<{ ok: true; claimedAt?: number } | { ok: false; message: string }> {
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
        offering = CASE
          WHEN sponsorship_slot_claims.offering = 'founding_sponsor'
            AND sponsorship_slot_claims.request_key = excluded.request_key
            AND sponsorship_slot_claims.claimed_at > ?
          THEN 'founding_sponsor'
          ELSE excluded.offering
        END,
        claimed_at = CASE
          WHEN ? = 1
            AND sponsorship_slot_claims.offering = 'founding_sponsor'
            AND sponsorship_slot_claims.request_key = excluded.request_key
            AND sponsorship_slot_claims.claimed_at > ?
          THEN sponsorship_slot_claims.claimed_at
          ELSE excluded.claimed_at
        END
      WHERE sponsorship_slot_claims.request_key = excluded.request_key
         OR sponsorship_slot_claims.claimed_at <= ?
      RETURNING task_slug, claimed_at`,
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
      founding ? 1 : 0,
      input.now - FOUNDING_HOLD_REUSE_MS,
      input.now - SPONSOR_CHECKOUT_EXPIRY_MS,
    ],
  })
  const row = claimed.rows[0]
  if (row) return { ok: true, claimedAt: Number(row.claimed_at) }
  if (founding && (await foundingSpotsTaken(db, input.now, input.taskSlug)) >= FOUNDING_SPONSOR_CAP) {
    return { ok: false, message: FOUNDING_SOLD_OUT }
  }
  return { ok: false, message: SPONSOR_SLOT_TAKEN }
}

/**
 * Key prefix for the manual rows written from live founding Payment Link
 * sales (docs/runbooks/sponsor-reject-refund.md). Those rows are
 * placement_weekly/placement_monthly, so the prefix on
 * stripe_checkout_session_id is what marks them as founding sales:
 * `founding_link:<cs_…>` for the first period and
 * `founding_link:<cs_…>:<in_…>` for each later one. No schema change.
 */
export const FOUNDING_LINK_KEY_PREFIX = 'founding_link:'

/**
 * Founding spots in use. There is one shared cap of 5 across the app offer and
 * the founding Payment Link:
 * - every paid, unrefunded founding_sponsor row (a canceled one still counts);
 * - every founding Payment Link sale whose first-period row
 *   (`founding_link:<cs_…>`, no `:<in_…>` suffix) is paid and unrefunded. Renewal
 *   rows never count on their own, so a renewal written after the first period
 *   was refunded does not bring the sale back. The key is matched trimmed and
 *   case-insensitively, and LIKE's `_` also accepts `founding-link:`;
 * - founding checkout holds younger than the Checkout expiry, unless the
 *   task's paid founding row came from that hold (paid_at at or after the
 *   hold's claimed_at), so a paid row and its own hold count once. A paid row
 *   from an older sale (for example a canceled, ended founder on that page)
 *   does not cancel out a new hold. The hold on excludeTask is left out,
 *   because a new claim on that task replaces it.
 */
/** The manual row key, normalized: trimmed and lowercased. */
const FOUNDING_LINK_KEY_SQL = 'lower(trim(stripe_checkout_session_id))'
/** The part after the prefix: `<cs_…>` for a first-period row, `<cs_…>:<in_…>` for a renewal. */
const FOUNDING_LINK_REST_SQL = `substr(${FOUNDING_LINK_KEY_SQL}, ${FOUNDING_LINK_KEY_PREFIX.length + 1})`

const FOUNDING_TAKEN_SQL = `
  (SELECT count(*) FROM sponsorships
    WHERE offering = 'founding_sponsor' AND status = 'paid' AND refunded_at IS NULL)
  + (SELECT count(*) FROM sponsorships
    WHERE ${FOUNDING_LINK_KEY_SQL} LIKE '${FOUNDING_LINK_KEY_PREFIX}%'
      AND ${FOUNDING_LINK_REST_SQL} != ''
      AND instr(${FOUNDING_LINK_REST_SQL}, ':') = 0
      AND offering IN ('placement_weekly', 'placement_monthly')
      AND status = 'paid' AND refunded_at IS NULL)
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
          AND paid.paid_at >= hold.claimed_at
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

/**
 * For /sponsor: true once every founding spot is taken (foundingSpotsLeft is 0),
 * so the page renders the founding option disabled and labeled Sold out.
 * Display only. The checkout claim (claimSponsorSlot) is the authority: it
 * refuses a founding hold past the cap in one statement. If this read fails,
 * the page logs the error name and shows the option as open; a checkout
 * attempt is then still refused by the claim, or fails on the same database.
 */
export async function foundingSoldOutNow(now = Date.now(), db?: Database): Promise<boolean> {
  try {
    return (await foundingSpotsLeft(db ?? getDb(), now)) === 0
  } catch (error) {
    console.error('founding availability read failed', error instanceof Error ? error.name : 'error')
    return false
  }
}

/**
 * Drop this request's hold after Checkout fails. Another request's hold stays.
 *
 * A founding hold is never released early: it runs its full 24 hours. A
 * failed create can still have made a session (a lost response, a Stripe 5xx,
 * a session with an unusable URL), and that session stays payable until its
 * expires_at. Releasing the hold would free the spot for a sixth founder while
 * it can still be paid. The buyer's retry from the same form reuses the hold
 * and replays the same Stripe request.
 */
export async function releaseSponsorSlot(
  db: Database,
  input: { taskSlug: string; requestKey: string },
): Promise<void> {
  await db.$client.execute({
    sql: `UPDATE sponsorship_slot_claims
      SET claimed_at = 0
      WHERE task_slug = ? AND request_key = ? AND offering != 'founding_sponsor'`,
    args: [input.taskSlug, input.requestKey],
  })
}
