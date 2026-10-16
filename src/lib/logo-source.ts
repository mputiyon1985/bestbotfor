/** Display size for every tool mark. Fixed so the cards do not shift. */
export const TOOL_LOGO_SIZE = 40

/** Self-hosted tiles. Pages must not import the source-url manifest. */
export const LOGO_PUBLIC_DIR = 'public/logos'

export const LOGO_MANIFEST_PATH = 'src/data/logo-manifest.json'

export function logoAlt(name: string): string {
  return `${name} logo`
}

/** First letter of the tool name, for the monogram tile. */
export function monogramLetter(name: string): string {
  const trimmed = name.trim()
  const match = trimmed.match(/\p{L}|\p{N}/u)
  const char = match?.[0] ?? trimmed[0] ?? '?'
  return char.toLocaleUpperCase('en-US')
}

/**
 * Hosts that belong to the tool: its official URL and reviewed hosts, plus
 * the www and apex pair. Other hosts, including logo CDNs, are rejected.
 */
export function toolSiteHosts(toolUrl: string, allowedHosts: readonly string[]): Set<string> {
  const hosts = new Set<string>()
  const add = (value: string) => {
    const host = value.trim().toLowerCase().replace(/\.$/, '')
    if (!host || host.includes('/') || host.includes('*')) return
    const apex = host.replace(/^www\./, '')
    hosts.add(apex)
    hosts.add(`www.${apex}`)
  }
  try {
    add(new URL(toolUrl).hostname)
  } catch {
    // A broken tool URL simply contributes no host.
  }
  for (const host of allowedHosts) add(host)
  return hosts
}

export function isToolSiteUrl(assetUrl: string, toolUrl: string, allowedHosts: readonly string[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(assetUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password || parsed.port !== '') return false
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostBelongsToTool(host, toolUrl, allowedHosts)) return false
  if (isLogoCdn(host, parsed.pathname)) return false
  return true
}

/** Apex, www, and subdomains of the tool host. Parent domains such as google.com are not included. */
export function hostBelongsToTool(host: string, toolUrl: string, allowedHosts: readonly string[]): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '')
  for (const root of toolSiteHosts(toolUrl, allowedHosts)) {
    const apex = root.replace(/^www\./, '')
    if (normalized === apex || normalized === `www.${apex}` || normalized.endsWith(`.${apex}`)) return true
  }
  return false
}

function isLogoCdn(host: string, pathname: string): boolean {
  if (host === 'www.google.com' && pathname.startsWith('/s2/favicons')) return true
  if (host.endsWith('.gstatic.com') || host === 'gstatic.com') return true
  if (host.endsWith('.googleusercontent.com')) return true
  if (host.endsWith('.clearbit.com') || host === 'clearbit.com') return true
  if (host === 'logo.dev' || host.endsWith('.logo.dev')) return true
  if (host === 'unavatar.io' || host.endsWith('.unavatar.io')) return true
  if (host === 'cdn.simpleicons.org' || host === 'simpleicons.org') return true
  if (host.endsWith('.jsdelivr.net') || host === 'unpkg.com') return true
  if (host.endsWith('.website-files.com') || host.endsWith('.wp.com')) return true
  return false
}
