import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ATTESTATION,
  LAWYER_REVIEW_NOTICE,
  MODERATION_REASONS,
  PRIVACY_UPDATED_WITH_RATINGS,
  ratingsPolicyCorpus,
  TERMS_UPDATED_WITH_RATINGS,
} from './ratings-policy-copy'

const BANNED = ['verified buyers', 'verified users of', 'all reviews', 'independent']

describe('ratings policy copy', () => {
  it('keeps the claims the spec allows and leaves out the ones it bans', () => {
    const corpus = ratingsPolicyCorpus()
    const lower = corpus.toLowerCase()
    for (const phrase of BANNED) {
      expect(lower, phrase).not.toContain(phrase)
    }
    expect(corpus).toContain(LAWYER_REVIEW_NOTICE)
    expect(LAWYER_REVIEW_NOTICE).toContain('October 17, 2026')
    expect(LAWYER_REVIEW_NOTICE).toContain('ratings drafts')
    expect(LAWYER_REVIEW_NOTICE).toContain('base policy pages')
    expect(LAWYER_REVIEW_NOTICE).toContain('pending link')
    expect(LAWYER_REVIEW_NOTICE).toContain('not launched')
    expect(LAWYER_REVIEW_NOTICE).not.toMatch(/pending lawyer review/i)
    expect(PRIVACY_UPDATED_WITH_RATINGS).not.toMatch(/pending lawyer review/i)
    expect(TERMS_UPDATED_WITH_RATINGS).not.toMatch(/pending lawyer review/i)
    expect(corpus).toContain(ATTESTATION)
    expect(corpus).toContain('registered users with a verified email')
    expect(corpus).toContain('We publish every rating that meets our guidelines, positive or negative.')
    expect(corpus).toContain('network range')
    expect(corpus).toContain('IPv4 /24')
    expect(corpus).toContain('IPv6 /48')
    expect(corpus).toContain('90 days')
    expect(corpus).toContain('1.5')
    expect(corpus).toContain('at least 5')
    expect(corpus).toContain('We do not store the raw IP address, the email address, or a user agent')
    for (const row of MODERATION_REASONS) {
      expect(corpus).toContain(row.code)
    }
  })

  it('renders the new pages and the policy additions only through the ratings flag', () => {
    for (const file of ['src/app/review-guidelines/page.tsx', 'src/app/how-user-ratings-work/page.tsx']) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source, file).toContain('userRatingsEnabled()')
      expect(source, file).toContain('notFound()')
      expect(source, file).toContain("export const dynamic = 'force-dynamic'")
      expect(source, file).toContain('LawyerReviewNotice')
      expect(source, file).not.toMatch(/pending lawyer review/i)
    }
    for (const file of ['src/app/privacy/page.tsx', 'src/app/terms/page.tsx', 'src/app/disclosure/page.tsx']) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source, file).toContain('userRatingsEnabled()')
      expect(source, file).toContain("export const dynamic = 'force-dynamic'")
      expect(source, file).toContain('LawyerReviewNotice')
    }
  })
})
