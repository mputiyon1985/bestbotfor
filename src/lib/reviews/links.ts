import { registrableDomain } from './domain'
import { normalizeReviewText } from './normalize'
import { canonicalIp } from './ip'

export const LINK_HINTS = ['contains link or contact', 'multiple links', 'vendor or competitor link'] as const
export type LinkHint = (typeof LINK_HINTS)[number]

export type LinkContext = {
  ownDomains?: readonly string[]
  competitorDomains?: readonly string[]
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const SCHEME_URL = /https?:\/\/[^\s<>"']+/gi
const WWW_URL = /\bwww\.[^\s<>"']+/gi
const BARE_DOMAIN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi
const PHONE = /(?:\+|00)?\d[\d\s().-]{8,}\d/g

/** Plain text only. Does not wrap URLs, emails, or domains in anchors. */
export function renderReviewPlainText(value: string): string {
  return normalizeReviewText(value)
}

function domainSet(values: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const value of values) {
    const domain = registrableDomain(value)
    if (domain) set.add(domain)
  }
  return set
}

function take(pattern: RegExp, text: string): { matches: string[]; rest: string } {
  const matches = text.match(pattern) ?? []
  return { matches, rest: text.replace(pattern, ' ') }
}

function phoneHits(text: string): number {
  const matches = text.match(PHONE) ?? []
  let count = 0
  for (const match of matches) {
    const token = match.trim()
    if (canonicalIp(token)) continue
    const digits = token.replace(/\D/g, '')
    if (digits.length >= 10 && digits.length <= 15) count += 1
  }
  return count
}

/**
 * Moderator hints only. The return value is a list of labels.
 * It has no status and cannot block, hold, reject, or hide a review.
 */
export function linkSignals(value: string, context: LinkContext = {}): LinkHint[] {
  let text = normalizeReviewText(value).toLowerCase()
  const emails = take(EMAIL, text)
  text = emails.rest
  const schemes = take(SCHEME_URL, text)
  text = schemes.rest
  const www = take(WWW_URL, text)
  text = www.rest
  const bare = (text.match(BARE_DOMAIN) ?? []).filter((token) => registrableDomain(token) !== null)
  text = text.replace(BARE_DOMAIN, ' ')
  const urls = [...schemes.matches, ...www.matches, ...bare]
  const phones = phoneHits(text)
  const hints: LinkHint[] = []
  if (emails.matches.length > 0 || urls.length > 0 || phones > 0) hints.push('contains link or contact')
  if (urls.length >= 2) hints.push('multiple links')
  const watched = domainSet([...(context.ownDomains ?? []), ...(context.competitorDomains ?? [])])
  const competitor = urls.some((url) => {
    const domain = registrableDomain(url)
    return domain !== null && watched.has(domain)
  })
  if (competitor) hints.push('vendor or competitor link')
  return hints
}
