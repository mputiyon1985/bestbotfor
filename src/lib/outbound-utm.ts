/**
 * Our own attribution on outbound /go clicks:
 * utm_source=bestbotfor&utm_medium=referral&utm_campaign=<page type>.
 *
 * Added only when the destination carries no utm key at all (after the
 * inbound passthrough), so an affiliate URL's own UTMs, or UTMs passed in on
 * the /go link, are never overwritten or mixed with ours. A key counts when
 * it starts with utm_ or utm-. DocsAlot's tracking link uses the hyphen.
 * Sendr's Cello code is the path. That link is returned with no query.
 */
const EXISTING_UTM_KEY = /^utm[_-]/i
const SENDR_CELLO_TRACKING_URL = 'https://sendr.cello.so/LOp5fYtd9Jc'

/** The approved Sendr link, with any query or hash removed. Null for every other URL. */
export function exactCelloTrackingUrl(destination: string): string | null {
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return null
  if (url.hostname !== 'sendr.cello.so' || url.pathname !== '/LOp5fYtd9Jc') return null
  return SENDR_CELLO_TRACKING_URL
}

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
  // Approved Sendr link. A query already on it is removed. /go applies this before inbound params.
  const cello = exactCelloTrackingUrl(destination)
  if (cello) return cello
  for (const key of url.searchParams.keys()) {
    if (EXISTING_UTM_KEY.test(key)) return destination
  }
  url.searchParams.set('utm_source', OUTBOUND_UTM_SOURCE)
  url.searchParams.set('utm_medium', OUTBOUND_UTM_MEDIUM)
  url.searchParams.set('utm_campaign', pageType)
  return url.toString()
}
