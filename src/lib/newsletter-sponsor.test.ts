import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import { SPONSORED_LABEL } from './best-placement'
import {
  newsletterSponsorIssueExport,
  newsletterSponsorIssueHtml,
  renderPaidNewsletterSponsor,
  type NewsletterSponsorRow,
} from './newsletter-sponsor'

const ISSUE = '2026-10-21'

function row(overrides: Partial<NewsletterSponsorRow> = {}): NewsletterSponsorRow {
  return {
    offering: 'newsletter_slot',
    status: 'paid',
    company: 'Acme',
    issueDate: ISSUE,
    amountTotal: 4_900,
    currency: 'usd',
    refundedAt: null,
    ...overrides,
  }
}

describe('renderPaidNewsletterSponsor', () => {
  it('labels a paid $49 newsletter slot and escapes buyer text', () => {
    const block = renderPaidNewsletterSponsor(row({ company: 'Acme <script> & "tools"' }))
    expect(block?.label).toBe(SPONSORED_LABEL)
    expect(block?.label).toBe('Sponsored')
    expect(block?.html).toBe('<p><strong>Sponsored</strong></p>\n<p>Acme &lt;script&gt; &amp; &quot;tools&quot;</p>')
    expect(block?.text).toBe('Sponsored\nAcme <script> & "tools"')
    expect(block?.html.startsWith('<p><strong>Sponsored</strong></p>')).toBe(true)
  })

  it('keeps the code label when the company tries to close the tag or supply its own', () => {
    const closed = renderPaidNewsletterSponsor(row({ company: '</strong></p><p>Editorial pick' }))
    expect(closed?.html.match(/<strong>Sponsored<\/strong>/g)).toEqual(['<strong>Sponsored</strong>'])
    expect(closed?.html).toContain('&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;Editorial pick')
    expect(closed?.html).not.toContain('</strong></p><p>Editorial')
    expect(closed?.text.startsWith('Sponsored\n')).toBe(true)

    const named = renderPaidNewsletterSponsor(row({ company: 'Sponsored' }))
    expect(named?.html).toBe('<p><strong>Sponsored</strong></p>\n<p>Sponsored</p>')
    expect(named?.company).toBe('Sponsored')
  })

  it('still emits Sponsored when the company name is blank', () => {
    const block = renderPaidNewsletterSponsor(row({ company: ' \u202E \u0000 ' }))
    expect(block?.html).toBe('<p><strong>Sponsored</strong></p>')
    expect(block?.text).toBe('Sponsored')
    expect(block?.company).toBe('')
  })

  it('renders nothing for an unpaid, refunded, mispriced, or non-newsletter row', () => {
    expect(renderPaidNewsletterSponsor(row({ status: 'pending' }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ status: 'failed' }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ refundedAt: 1 }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ amountTotal: 9_900 }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ amountTotal: null }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ currency: 'eur' }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ offering: 'placement_weekly', amountTotal: 9_900 }))).toBeNull()
    expect(renderPaidNewsletterSponsor(row({ currency: 'USD' }))?.label).toBe('Sponsored')
    expect(renderPaidNewsletterSponsor(row({ currency: null }))?.company).toBe('Acme')
  })

  it('builds the label in code and has no switch that drops it', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/newsletter-sponsor.ts'), 'utf8')
    expect(source).toContain('const LABEL = SPONSORED_LABEL')
    expect(source).toContain('<p><strong>${label}</strong></p>')
    expect(source).not.toMatch(/omitLabel|hideLabel|skipLabel|label\?:/)
    const signature = source.slice(source.indexOf('export function renderPaidNewsletterSponsor'), source.indexOf('const price'))
    expect(signature).not.toContain('label')
  })
})

describe('newsletterSponsorIssueHtml', () => {
  it('includes only the paid $49 slots for that issue date', () => {
    const html = newsletterSponsorIssueHtml(
      [
        row(),
        row({ company: 'Later', issueDate: '2026-10-22' }),
        row({ company: 'Weekly', offering: 'placement_weekly', amountTotal: 9_900, issueDate: ISSUE }),
        row({ company: 'Refunded', refundedAt: 5 }),
        row({ company: 'Other <b>Co</b>' }),
      ],
      ISSUE,
    )
    expect(html).toBe(
      '<p><strong>Sponsored</strong></p>\n<p>Acme</p>\n\n<p><strong>Sponsored</strong></p>\n<p>Other &lt;b&gt;Co&lt;/b&gt;</p>',
    )
    expect(html).not.toContain('Later')
    expect(html).not.toContain('Weekly')
    expect(html).not.toContain('Refunded')
  })
})

describe('newsletterSponsorIssueExport', () => {
  it('exports the Beehiiv HTML for paid $49 rows and leaves other rows out', async () => {
    const { db, close } = await createTestDatabase()
    try {
      const base = { createdAt: 1, updatedAt: 1, paidAt: 1, email: 'buyer@example.com' }
      await db.insert(sponsorships).values([
        {
          ...base,
          stripeCheckoutSessionId: 'cs_newsletter_acme',
          offering: 'newsletter_slot',
          status: 'paid',
          company: 'Acme',
          issueDate: ISSUE,
          amountTotal: 4_900,
          currency: 'usd',
        },
        {
          ...base,
          stripeCheckoutSessionId: 'cs_newsletter_other',
          offering: 'newsletter_slot',
          status: 'paid',
          company: 'Other Co',
          issueDate: ISSUE,
          amountTotal: 4_900,
          currency: 'usd',
        },
        {
          ...base,
          stripeCheckoutSessionId: 'cs_newsletter_pending',
          offering: 'newsletter_slot',
          status: 'pending',
          company: 'Pending Co',
          issueDate: ISSUE,
          amountTotal: 4_900,
          currency: 'usd',
          paidAt: null,
        },
        {
          ...base,
          stripeCheckoutSessionId: 'cs_newsletter_refunded',
          offering: 'newsletter_slot',
          status: 'paid',
          company: 'Refunded Co',
          issueDate: ISSUE,
          amountTotal: 4_900,
          currency: 'usd',
          refundedAt: 2,
        },
        {
          ...base,
          stripeCheckoutSessionId: 'cs_guide_week',
          offering: 'placement_weekly',
          status: 'paid',
          company: 'Guide Co',
          taskSlug: 'coding',
          issueDate: ISSUE,
          amountTotal: 9_900,
          currency: 'usd',
        },
      ])
      const html = await newsletterSponsorIssueExport(db, ISSUE)
      expect(html).toContain('<p><strong>Sponsored</strong></p>\n<p>Acme</p>')
      expect(html).toContain('<p><strong>Sponsored</strong></p>\n<p>Other Co</p>')
      expect(html.match(/<strong>Sponsored<\/strong>/g)).toHaveLength(2)
      expect(html).not.toContain('Pending Co')
      expect(html).not.toContain('Refunded Co')
      expect(html).not.toContain('Guide Co')
      expect(html).not.toContain('buyer@example.com')
      expect(await newsletterSponsorIssueExport(db, '2026-11-01')).toBe('')
    } finally {
      await close()
    }
  })

  it('puts the sponsor copy and link under the Sponsored label and limits production to a read-only token', () => {
    const runbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/newsletter-sponsor-label.md'), 'utf8')
    expect(runbook).toContain('The sponsor\'s copy goes under the Sponsored label.')
    expect(runbook).toContain('The sponsor\'s link goes under that copy.')
    expect(runbook).toContain('rel="sponsored nofollow"')
    expect(runbook).toContain('Run the export against production with a read-only token only.')
    expect(runbook).toContain('James\'s CEO OK (2026-10-18)')
  })

  it('prints that HTML from the export script and does not select the email', () => {
    const script = readFileSync(path.join(process.cwd(), 'scripts/export-newsletter-sponsor.ts'), 'utf8')
    const source = readFileSync(path.join(process.cwd(), 'src/lib/newsletter-sponsor.ts'), 'utf8')
    expect(script).toContain('newsletterSponsorIssueExport')
    expect(script).toContain('process.stdout.write')
    expect(script).not.toMatch(/\.email|sponsorships\.email/)
    expect(source).toContain('The select list has no email column')
    expect(source).not.toContain('sponsorships.email')
  })
})
