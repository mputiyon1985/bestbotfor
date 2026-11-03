import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from './db'
import { sponsorships } from './db/schema'
import { SPONSOR_CONTACT_EMAIL } from './sponsor-checkout-gate'

/** Log tag when a newsletter checkout is paid after its issue date. */
export const NEWSLETTER_ISSUE_PASSED_ALERT_TAG = 'NEWSLETTER ISSUE PASSED'

const ISSUE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * True when the issue date is a real UTC day strictly before the UTC day of
 * paidAt. An on-time payment stays unflagged after the issue goes out.
 * The same comparison is `issue_date < date(paid_at)` in the admin list.
 */
export function newsletterPaidAfterIssue(issueDate: string | null | undefined, paidAt: number): boolean {
  const match = ISSUE_DATE.exec(issueDate ?? '')
  if (!match || !Number.isFinite(paidAt)) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const issue = new Date(Date.UTC(year, month - 1, day))
  if (issue.getUTCFullYear() !== year || issue.getUTCMonth() !== month - 1 || issue.getUTCDate() !== day) return false
  const paid = new Date(paidAt)
  const paidDay = Date.UTC(paid.getUTCFullYear(), paid.getUTCMonth(), paid.getUTCDate())
  return issue.getTime() < paidDay
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
    })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.offering, 'newsletter_slot'),
        eq(sponsorships.status, 'paid'),
        isNull(sponsorships.refundedAt),
        sql`${sponsorships.issueDate} < date(${sponsorships.paidAt} / 1000, 'unixepoch')`,
      ),
    )
  return rows.flatMap((row) => (row.issueDate ? [{ sessionId: row.sessionId, issueDate: row.issueDate }] : []))
}

export function flagPassedNewsletterIssue(input: {
  sessionId: string
  offeringId: string
  issueDate: string | null
  now: number
}): void {
  if (input.offeringId !== 'newsletter_slot' || !input.issueDate || !newsletterPaidAfterIssue(input.issueDate, input.now)) return
  alertNewsletterIssuePassed({ sessionId: input.sessionId, issueDate: input.issueDate })
}
