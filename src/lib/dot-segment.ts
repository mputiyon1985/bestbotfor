import { requestPath } from './catalog-path'

/**
 * Vercel matches this against the incoming pathname, before Next.js runs.
 * `new URL()` removes dot segments, so the app cannot see them after that.
 * Keep this string identical to the `src` route in `vercel.json`.
 */
export const DOT_SEGMENT_ROUTE_SRC =
  '^(?:.*?)(?:^|/)(?:\\.|%2[eE]|%252[eE]|%25252[eE]){1,2}(?:/|%2[fF]|%5[cC]|$).*$'

const DOT_SEGMENT_ROUTE = new RegExp(DOT_SEGMENT_ROUTE_SRC)

/** One path segment that is `.` or `..`, including percent-encoded forms. */
const DOT_SEGMENT = /^(?:\.|%2e|%252e|%25252e){1,2}$/i

function segmentIsDot(segment: string, depth: number): boolean {
  if (segment === '.' || segment === '..' || DOT_SEGMENT.test(segment)) return true
  if (depth >= 3) return false
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return false
  }
  if (decoded === segment) return false
  if (decoded.includes('/') || decoded.includes('\\')) {
    return decoded.split(/[/\\]/).some((part) => part !== '' && segmentIsDot(part, depth + 1))
  }
  return segmentIsDot(decoded, depth + 1)
}

/**
 * True when the raw request path contains a dot segment. This does not use
 * the URL constructor, which would collapse the segment before the check.
 */
export function hasDotSegment(rawUrl: string): boolean {
  const path = requestPath(rawUrl)
  return path.split('/').some((segment) => segment !== '' && segmentIsDot(segment, 0))
}

/** Same rule the Vercel edge route applies to a pathname, without the query. */
export function edgeRouteMatchesPath(pathname: string): boolean {
  return DOT_SEGMENT_ROUTE.test(pathname)
}
