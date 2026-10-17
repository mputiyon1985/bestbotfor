import { requestPath } from './catalog-path'

/**
 * Vercel matches this against the incoming pathname before Next.js runs.
 * A header route `/:path*` decodes the path before the proxy is called, and
 * a truncated escape throws there. Keep this string identical to the matching
 * `src` route in `vercel.json`.
 *
 * A `%` that is not followed by two hex digits. Valid encodings such as
 * `%63` and `%2e` do not match.
 */
export const MALFORMED_PERCENT_ROUTE_SRC =
  '^.*%(?:$|[^0-9A-Fa-f]|[0-9A-Fa-f](?:$|[^0-9A-Fa-f])).*$'

const MALFORMED_PERCENT_ROUTE = new RegExp(MALFORMED_PERCENT_ROUTE_SRC)

export const MALFORMED_PERCENT_MESSAGE = 'Bad request.'

/**
 * True when the path contains a percent-escape `decodeURIComponent` rejects.
 * That is a truncated `%`, a non-hex pair, or bytes that are not UTF-8.
 * The query string is ignored. This does not use the URL constructor.
 */
export function hasMalformedPercentEncoding(rawUrl: string): boolean {
  const path = requestPath(rawUrl)
  try {
    decodeURIComponent(path)
    return false
  } catch {
    return true
  }
}

/** Same rule the Vercel route applies to a pathname, without the query. */
export function edgeRouteMatchesMalformedPercent(pathname: string): boolean {
  return MALFORMED_PERCENT_ROUTE.test(pathname)
}
