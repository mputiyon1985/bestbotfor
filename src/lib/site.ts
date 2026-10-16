/** Apex production origin. Used when NEXT_PUBLIC_SITE_URL is missing or invalid. */
export const DEFAULT_SITE_URL = 'https://bestbotfor.com'

export const TAGLINE = 'The right AI in 30 seconds.'

export const SITE_NAME = 'BestBotFor'

/**
 * Sitewide switch for the BestBotFor score: the heading, stars, numeric
 * score, criteria bars, and the "How we score" note. Pros and cons stay
 * visible either way. Set this to true to publish scores again.
 * A code constant on purpose, so no environment variable is required.
 */
export const SHOW_SCORES: boolean = false

/**
 * Canonical origin for sitemap, Open Graph, and JSON-LD.
 * http is accepted only for localhost so tests and local dev can set a site URL.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return DEFAULT_SITE_URL
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && local) return url.origin
  } catch {
    return DEFAULT_SITE_URL
  }
  return DEFAULT_SITE_URL
}

export function absoluteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return new URL(path, getSiteUrl()).toString()
}
