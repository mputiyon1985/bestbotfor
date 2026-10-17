export const NEWSLETTER_SOURCES = ['home', 'result', 'best', 'compare', 'newsletter'] as const

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number]

const REFERRING_PATH: Record<NewsletterSource, string> = {
  home: '/',
  result: '/result',
  best: '/best',
  compare: '/compare',
  newsletter: '/newsletter',
}

/** Unknown values become the newsletter page. The path is never taken from the request. */
export function parseNewsletterSource(value: string): NewsletterSource {
  for (const source of NEWSLETTER_SOURCES) {
    if (source === value) return source
  }
  return 'newsletter'
}

export function newsletterReferringPath(source: NewsletterSource): string {
  return REFERRING_PATH[source]
}
