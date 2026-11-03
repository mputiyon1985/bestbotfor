import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from './db'
import { sponsorships } from './db/schema'
import { SPONSOR_CONTACT_EMAIL } from './sponsor-checkout-gate'

/** Log tag when a newsletter checkout is paid after its issue date. */
export const NEWSLETTER_ISSUE_PASSED_ALERT_TAG = 'NEWSLETTER ISSUE PASSED'

const ISSUE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * UTC midnight for a real calendar day, or null. 2026-02-31 is null.
 * Checkout, the webhook alert, and the admin list all use this parser.
 */
export function parseIssueDay(value: string | null | undefined): number | null {
  const match = ISSUE_DATE.exec(value ?? '')
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = Date.UTC(year, month - 1, day)
  const issue = new Date(utc)
  if (issue.getUTCFullYear() !== year || issue.getUTCMonth() !== month - 1 || issue.getUTCDate() !== day) return null
  return utc
}

/**
 * True when the issue date is a real UTC day strictly before the UTC day of
 * paidAt. An on-time payment stays unflagged after the issue goes out.
 * An impossible date is not late. The admin list uses this same check.
 */
export function newsletterPaidAfterIssue(issueDate: string | null | undefined, paidAt: number): boolean {
  const issue = parseIssueDay(issueDate)
  if (issue == null || !Number.isFinite(paidAt)) return false
  const paid = new Date(paidAt)
  const paidDay = Date.UTC(paid.getUTCFullYear(), paid.getUTCMonth(), paid.getUTCDate())
  return issue < paidDay
}

export type PassedNewsletterIssue = { sessionId: string; issueDate: string }

/**
 * A recovered newsletter Checkout stays payable for 30 days. If it completes
 * after the issue date, the row is kept and flagged. Nothing is refunded.
 * The log has the session id and the date, never the buyer's email.
 */
export function alertNewsletterIssuePassed(input: { sessionId: string; issueDate: string }): void {
  console.error(
    NEWSLETTER_ISSUE_PASSED_ALERT_TAG,
    JSON.stringify({
      session: input.sessionId,
      issue_date: input.issueDate,
      action: 'not refunded; Mark decides refund or honor; see /admin/sponsors',
      to: SPONSOR_CONTACT_EMAIL,
    }),
  )
}

export async function listPassedNewsletterIssues(db: Database): Promise<PassedNewsletterIssue[]> {
  const rows = await db
    .select({
      sessionId: sponsorships.stripeCheckoutSessionId,
      issueDate: sponsorships.issueDate,
      paidAt: sponsorships.paidAt,
    })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.offering, 'newsletter_slot'),
        eq(sponsorships.status, 'paid'),
        isNull(sponsorships.refundedAt),
      ),
    )
  return rows.flatMap((row) =>
    row.issueDate && row.paidAt != null && newsletterPaidAfterIssue(row.issueDate, row.paidAt)
      ? [{ sessionId: row.sessionId, issueDate: row.issueDate }]
      : [],
  )
}

/** Compares the issue date to the stored paid_at, not the time this event arrived. */
export async function flagPassedNewsletterIssue(
  db: Database,
  input: {
    sessionId: string
    offeringId: string
    issueDate: string | null
  },
): Promise<void> {
  if (input.offeringId !== 'newsletter_slot' || !input.issueDate || parseIssueDay(input.issueDate) == null) return
  const [row] = await db
    .select({ paidAt: sponsorships.paidAt })
    .from(sponsorships)
    .where(eq(sponsorships.stripeCheckoutSessionId, input.sessionId))
  if (row?.paidAt == null || !newsletterPaidAfterIssue(input.issueDate, row.paidAt)) return
  alertNewsletterIssuePassed({ sessionId: input.sessionId, issueDate: input.issueDate })
}
