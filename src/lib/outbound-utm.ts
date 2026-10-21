/**
 * Our own attribution on outbound /go clicks:
 * utm_source=bestbotfor&utm_medium=referral&utm_campaign=<page type>.
 *
 * Added only when the destination carries no utm_* key at all (after the
 * inbound passthrough), so an affiliate URL's own UTMs, or UTMs passed in on
 * the /go link, are never overwritten or mixed with ours.
 */
export const OUTBOUND_UTM_SOURCE = 'bestbotfor'
export const OUTBOUND_UTM_MEDIUM = 'referral'

const PAGE_TYPES: Record<string, string> = {
  tools: 'tool',
  best: 'best',
  compare: 'compare',
  alternatives: 'alternatives',
  guides: 'guide',
  result: 'result',
  search: 'search',
  deals: 'deals',
  members: 'members',
  'ai-loadout': 'loadout',
}

/** Page type from a same-origin path (sameOriginPath output). Never echoes the raw path. */
export function outboundPageType(path: string): string {
  if (!path || path === 'direct') return 'direct'
  if (path === '/') return 'home'
  const first = path.split('/')[1] ?? ''
  return PAGE_TYPES[first] ?? 'other'
}

export function withOutboundUtm(destination: string, pageType: string): string {
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return destination
  }
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().startsWith('utm_')) return destination
  }
  url.searchParams.set('utm_source', OUTBOUND_UTM_SOURCE)
  url.searchParams.set('utm_medium', OUTBOUND_UTM_MEDIUM)
  url.searchParams.set('utm_campaign', pageType)
  return url.toString()
}
