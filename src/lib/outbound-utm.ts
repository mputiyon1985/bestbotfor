/**
 * Our own attribution on outbound /go clicks:
 * utm_source=bestbotfor&utm_medium=referral&utm_campaign=<page type>.
 *
 * Added only when the destination carries no utm key at all (after the
 * inbound passthrough), so an affiliate URL's own UTMs, or UTMs passed in on
 * the /go link, are never overwritten or mixed with ours. A key counts when
 * it starts with utm_ or utm-. DocsAlot's tracking link uses the hyphen.
 * Sendr's Cello code, Julius AI's Dub code, Context.dev's link code, and
 * DocsAlot's Stripe checkout codes are the path. Videco's Endorsely code is
 * the via query. Those links are returned exactly, with no extra query.
 */
const EXISTING_UTM_KEY = /^utm[_-]/i

/**
 * Approved tracking links. A path entry drops any query. A search entry matches
 * that query only, so the official site on the same host is left alone.
 * /go returns `url` and does not add a query.
 */
const EXACT_TRACKING_URLS: readonly {
  host: string
  pathname: string
  search?: string
  url: string
}[] = [
  { host: 'sendr.cello.so', pathname: '/LOp5fYtd9Jc', url: 'https://sendr.cello.so/LOp5fYtd9Jc' },
  { host: 'julius.dub.link', pathname: '/mark-putiyon', url: 'https://julius.dub.link/mark-putiyon' },
  { host: 'link.context.dev', pathname: '/mark-putiyon', url: 'https://link.context.dev/mark-putiyon' },
  { host: 'docsalot.dev', pathname: '/', search: '?utm-source=bestbotfor', url: 'https://docsalot.dev/?utm-source=bestbotfor' },
  { host: 'buy.stripe.com', pathname: '/dRmbJ197SdjH3jRa8f2Ji08', url: 'https://buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08' },
  { host: 'buy.stripe.com', pathname: '/eVqbJ1bg02F3f2z4NV2Ji07', url: 'https://buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07' },
  { host: 'videco.io', pathname: '/', search: '?via=mark276', url: 'https://videco.io?via=mark276' },
]

/**
 * An approved tracking link. A path-coded entry is returned with any query or
 * hash removed. A query-coded entry matches that query only. Null otherwise.
 */
export function exactPinnedTrackingUrl(destination: string): string | null {
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return null
  const match = EXACT_TRACKING_URLS.find((item) => {
    if (item.host !== url.hostname || item.pathname !== url.pathname) return false
    if (item.search != null) return url.search === item.search
    return true
  })
  return match?.url ?? null
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
  // Approved Sendr, Julius, Context.dev, DocsAlot checkout, and Videco links. A query already on a path-coded one is removed. /go applies this before inbound params.
  const pinned = exactPinnedTrackingUrl(destination)
  if (pinned) return pinned
  for (const key of url.searchParams.keys()) {
    if (EXISTING_UTM_KEY.test(key)) return destination
  }
  url.searchParams.set('utm_source', OUTBOUND_UTM_SOURCE)
  url.searchParams.set('utm_medium', OUTBOUND_UTM_MEDIUM)
  url.searchParams.set('utm_campaign', pageType)
  return url.toString()
}
