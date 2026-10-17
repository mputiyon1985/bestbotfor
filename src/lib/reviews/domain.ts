import { getDomain } from 'tldts'

/** Registrable domain (eTLD+1), lowercased. Accepts a host, a URL, or an email. */
export function registrableDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.length === 0) return null
  const domain = getDomain(trimmed, { allowPrivateDomains: true })
  if (!domain) return null
  return domain.toLowerCase()
}
