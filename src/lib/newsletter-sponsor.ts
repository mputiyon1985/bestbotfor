import { eq } from 'drizzle-orm'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { SPONSORED_LABEL } from './best-placement'
import { sanitizeSponsorCompany } from './sponsor-company'
import { sponsorOffering } from './sponsor-offerings'

/**
 * Beehiiv issue content for a paid $49 newsletter slot.
 * The Sponsored label is this constant. It is not a column, and the buyer
 * cannot pass text or HTML that removes it. Callers paste `html` into the issue.
 */
const LABEL = SPONSORED_LABEL

export type NewsletterSponsorRow = {
  offering: string
  status: string
  company: string | null
  issueDate: string | null
  amountTotal: number | null
  currency: string | null
  refundedAt: number | null
}

export type NewsletterSponsorBlock = {
  label: typeof SPONSORED_LABEL
  company: string
  html: string
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * The issue block for one paid $49 newsletter slot. Returns null for any other
 * offering, status, amount, currency, or a refund. The label is always LABEL.
 */
export function renderPaidNewsletterSponsor(row: NewsletterSponsorRow): NewsletterSponsorBlock | null {
  const price = sponsorOffering('newsletter_slot')
  if (!price || price.unitAmount !== 4_900) return null
  if (row.offering !== price.id || row.status !== 'paid' || row.refundedAt != null) return null
  if (row.amountTotal !== price.unitAmount) return null
  const currency = row.currency?.trim().toLowerCase() ?? ''
  if (currency !== '' && currency !== 'usd') return null
  const company = sanitizeSponsorCompany(row.company ?? '')
  const label = LABEL
  const html = company
    ? `<p><strong>${label}</strong></p>\n<p>${escapeHtml(company)}</p>`
    : `<p><strong>${label}</strong></p>`
  const text = company ? `${label}\n${company}` : label
  return { label, company, html, text }
}

/** HTML pasted into one Daily Bot issue. Each paid $49 slot for that date is included. */
export function newsletterSponsorIssueHtml(rows: readonly NewsletterSponsorRow[], issueDate: string): string {
  return rows
    .filter((row) => row.issueDate === issueDate)
    .flatMap((row) => {
      const block = renderPaidNewsletterSponsor(row)
      return block ? [block.html] : []
    })
    .join('\n\n')
}

/**
 * Reads sponsorship rows for one issue date and returns the Beehiiv HTML.
 * The select list has no email column. An empty string means no paid $49 slot.
 */
export async function newsletterSponsorIssueExport(db: Database, issueDate: string): Promise<string> {
  const rows = await db
    .select({
      offering: sponsorships.offering,
      status: sponsorships.status,
      company: sponsorships.company,
      issueDate: sponsorships.issueDate,
      amountTotal: sponsorships.amountTotal,
      currency: sponsorships.currency,
      refundedAt: sponsorships.refundedAt,
    })
    .from(sponsorships)
    .where(eq(sponsorships.issueDate, issueDate))
    .orderBy(sponsorships.id)
  return newsletterSponsorIssueHtml(rows, issueDate)
}
