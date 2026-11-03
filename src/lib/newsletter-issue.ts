import { and, eq, isNull, lt } from 'drizzle-orm'
import type { Database } from './db'
import { sponsorships } from './db/schema'
import { SPONSOR_CONTACT_EMAIL } from './sponsor-checkout-gate'

/** Log tag when a newsletter checkout is paid after its issue date. */
export const NEWSLETTER_ISSUE_PASSED_ALERT_TAG = 'NEWSLETTER ISSUE PASSED'

const ISSUE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True when the issue date is a real UTC day strictly before today. */
export function newsletterIssueHasPassed(issueDate: string | null | undefined, now: number): boolean {
  const match = ISSUE_DATE.exec(issueDate ?? '')
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const issue = new Date(Date.UTC(year, month - 1, day))
  if (issue.getUTCFullYear() !== year || issue.getUTCMonth() !== month - 1 || issue.getUTCDate() !== day) return false
  const today = new Date(now)
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return issue.getTime() < start
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

export async function listPassedNewsletterIssues(db: Database, now = Date.now()): Promise<PassedNewsletterIssue[]> {
  const today = new Date(now)
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10)
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
        lt(sponsorships.issueDate, start),
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
  if (input.offeringId !== 'newsletter_slot' || !input.issueDate || !newsletterIssueHasPassed(input.issueDate, input.now)) return
  alertNewsletterIssuePassed({ sessionId: input.sessionId, issueDate: input.issueDate })
}
