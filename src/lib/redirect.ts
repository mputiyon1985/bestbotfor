const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

export type RedirectTool = {
  url: string
  affiliateUrl: string | null
  allowedHosts: readonly string[]
}

/**
 * The only redirect target is the tool's official URL, and only when its host
 * is on that tool's reviewed list. Caller-supplied query keys are ignored.
 * affiliateUrl is accepted so tests can prove it is never used.
 */
export function decideRedirect(input: {
  tool: RedirectTool | null
}): { type: 'redirect'; url: string } | { type: 'not_found' } {
  if (!input.tool) return { type: 'not_found' }
  const safe = officialHttpsUrl(input.tool.url, input.tool.allowedHosts)
  if (!safe) return { type: 'not_found' }
  return { type: 'redirect', url: safe }
}

/**
 * Fail closed unless the stored URL is public https on a reviewed host.
 * Non-default ports are rejected. Hosts are compared after IDNA normalization.
 */
export function officialHttpsUrl(value: string, allowedHosts: readonly string[]): string | null {
  if (allowedHosts.length === 0) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (parsed.port !== '') return null
  const host = normalizedHostname(parsed.hostname)
  if (!hostAllowed(host, allowedHosts)) return null
  if (parsed.hostname !== host) parsed.hostname = host
  return parsed.toString()
}

/** Seed and CI fail when a tool's official URL is not an exact reviewed host. */
export function reviewedToolUrl(tool: { slug: string; url: string; allowedHosts: readonly string[] }): string {
  const safe = officialHttpsUrl(tool.url, tool.allowedHosts)
  if (!safe) {
    throw new Error(`Tool ${tool.slug} official URL is not on its reviewed host list`)
  }
  const host = new URL(safe).hostname
  const listedExactly = tool.allowedHosts.some((entry) => {
    const rule = parseAllowEntry(entry)
    return rule !== null && !rule.subdomains && rule.host === host
  })
  if (!listedExactly) {
    throw new Error(`Tool ${tool.slug} must list ${host} as an exact reviewed host`)
  }
  return safe
}

export function isStripeHostedUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      (url.hostname === 'checkout.stripe.com' || url.hostname === 'billing.stripe.com')
    )
  } catch {
    return false
  }
}

type AllowRule = { host: string; subdomains: boolean }

function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = canonicalHost(hostname)
  if (!host) return false
  for (const entry of allowedHosts) {
    const rule = parseAllowEntry(entry)
    if (!rule) continue
    if (host === rule.host) {
      if (!rule.subdomains) return true
      continue
    }
    if (rule.subdomains && host.endsWith(`.${rule.host}`)) return true
  }
  return false
}

function parseAllowEntry(entry: string): AllowRule | null {
  const trimmed = entry.trim()
  const subdomains = trimmed.startsWith('*.')
  const bare = subdomains ? trimmed.slice(2) : trimmed
  if (!bare || bare.includes('*')) return null
  const host = canonicalHost(bare)
  if (!host) return null
  return { host, subdomains }
}

/** Punycode, lowercase, and a single trailing-dot form of the same host. */
function canonicalHost(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || /[\s/\\@?#%]/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(`https://${trimmed}`)
  } catch {
    return null
  }
  if (url.username || url.password || url.port) return null
  if (url.pathname !== '/' || url.search || url.hash) return null
  const host = normalizedHostname(url.hostname)
  if (!HOSTNAME.test(host)) return null
  if (isBlockedHost(host)) return null
  return host
}

function normalizedHostname(hostname: string): string {
  const lower = hostname.toLowerCase()
  return lower.endsWith('.') ? lower.slice(0, -1) : lower
}

function isBlockedHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true
  if (host.includes(':') || host === '') return true
  return false
}
