import { notFoundDescription, notFoundTitle } from './metadata'
import { retryAfterSeconds } from './rate-limit'

const ROBOTS = 'noindex, nofollow'

function page(title: string, heading: string, message: string): string {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="${ROBOTS}"></head><body><h1>${heading}</h1><p>${message}</p></body></html>`
}

/** One robots meta. The not-found screen also injects a second tag, so /result 404s skip it. */
export function resultNotFoundHtml(): string {
  return page(notFoundTitle, 'Page not found', notFoundDescription)
}

export function resultRateLimitHtml(): string {
  return page('Too many results', 'Too many results', 'This network has asked for too many picks. Try again in a minute.')
}

export function resultNotFoundHeaders(): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': ROBOTS,
  }
}

export function resultRateLimitHeaders(resetAt: number, now = Date.now()): Record<string, string> {
  return {
    ...resultNotFoundHeaders(),
    'retry-after': String(retryAfterSeconds(resetAt, now)),
  }
}
