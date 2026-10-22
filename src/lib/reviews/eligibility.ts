import { registrableDomain } from './domain'

export const REVIEW_WAIT_MS = 72 * 60 * 60 * 1000

const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'aol.com',
  'gmx.com',
  'mail.com',
  'fastmail.com',
])

export type VendorDomainDecision = 'pass' | 'no_corporate_domain' | 'match'

/** Block when any verified email's registrable domain is a vendor domain. Free-mail cannot match. */
export function vendorDomainDecision(emails: readonly string[], vendorDomains: readonly string[]): VendorDomainDecision {
  const vendors = new Set(
    vendorDomains
      .map((domain) => registrableDomain(domain) ?? domain.trim().toLowerCase())
      .filter((domain) => domain.length > 0),
  )
  let corporate = false
  for (const email of emails) {
    const domain = registrableDomain(email)
    if (!domain || FREE_MAIL.has(domain)) continue
    corporate = true
    if (vendors.has(domain)) return 'match'
  }
  return corporate ? 'pass' : 'no_corporate_domain'
}

export function pastReviewWait(createdAtMs: number, now: number): boolean {
  return now - createdAtMs >= REVIEW_WAIT_MS
}

export function accountAgeDays(createdAtMs: number, now: number): number {
  return Math.floor((now - createdAtMs) / (24 * 60 * 60 * 1000))
}
