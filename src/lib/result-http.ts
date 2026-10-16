import type { Metadata } from 'next'
import { notFoundDescription, notFoundTitle } from './metadata'
import { retryAfterSeconds } from './rate-limit'

const ROBOTS = 'noindex, nofollow'

function page(title: string, heading: string, message: string): string {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="${ROBOTS}"></head><body><h1>${heading}</h1><p>${message}</p></body></html>`
}

/** One robots meta. Calling notFound() also injects a second tag, so /result misses skip it. */
export function resultNotFoundHtml(): string {
  return page(notFoundTitle, 'Page not found', notFoundDescription)
}

/** Same single directive as the proxy HTML, for the page the gate continues to. */
export function resultMissMetadata(): Metadata {
  return {
    title: { absolute: notFoundTitle },
    description: notFoundDescription,
    alternates: {},
    robots: { index: false, follow: false },
    openGraph: {
      title: { absolute: notFoundTitle },
      description: notFoundDescription,
    },
    twitter: {
      card: 'summary',
      title: { absolute: notFoundTitle },
      description: notFoundDescription,
    },
  }
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
