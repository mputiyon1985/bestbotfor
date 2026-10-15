const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

/**
 * The only redirect target is the tool's official URL stored in the database.
 * Caller-supplied query keys are ignored. affiliateUrl is accepted so tests
 * can prove it is never used.
 */
export function decideRedirect(input: {
  tool: { url: string; affiliateUrl: string | null } | null
}): { type: 'redirect'; url: string } | { type: 'not_found' } {
  if (!input.tool) return { type: 'not_found' }
  const safe = officialHttpsUrl(input.tool.url)
  if (!safe) return { type: 'not_found' }
  return { type: 'redirect', url: safe }
}

/** Fail closed unless the stored URL is a public https address with no credentials. */
export function officialHttpsUrl(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return null
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null
  if (host.includes(':') || host === '') return null
  if (!HOSTNAME.test(host)) return null
  return parsed.toString()
}

export function isStripeHostedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'checkout.stripe.com' || url.hostname === 'billing.stripe.com')
    )
  } catch {
    return false
  }
}
