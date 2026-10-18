/** Each /alternatives/[tool] page has its own source, so referring_site is that exact page. */
export const ALTERNATIVES_NEWSLETTER_TOOLS = ['chatgpt', 'midjourney', 'zapier', 'cursor', 'elevenlabs'] as const

type AlternativesSource = `alternatives-${(typeof ALTERNATIVES_NEWSLETTER_TOOLS)[number]}`

export const NEWSLETTER_SOURCES = [
  'home',
  'result',
  'best',
  'compare',
  'newsletter',
  'ai-loadout',
  'guides',
  ...ALTERNATIVES_NEWSLETTER_TOOLS.map((tool): AlternativesSource => `alternatives-${tool}`),
] as const

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number]

const REFERRING_PATH: Record<NewsletterSource, string> = {
  home: '/',
  result: '/result',
  best: '/best',
  compare: '/compare',
  newsletter: '/newsletter',
  'ai-loadout': '/ai-loadout',
  // The only guide today. A new guide needs its own source and a privacy-policy update.
  guides: '/guides/how-to-choose-an-ai-tool',
  'alternatives-chatgpt': '/alternatives/chatgpt',
  'alternatives-midjourney': '/alternatives/midjourney',
  'alternatives-zapier': '/alternatives/zapier',
  'alternatives-cursor': '/alternatives/cursor',
  'alternatives-elevenlabs': '/alternatives/elevenlabs',
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

/** Every path the policy must name, in source order. */
export function newsletterReferringPaths(): string[] {
  return NEWSLETTER_SOURCES.map((source) => REFERRING_PATH[source])
}

/** The form source for an /alternatives/[tool] page, or null when that page has none. */
export function alternativesNewsletterSource(toolSlug: string): NewsletterSource | null {
  const source = `alternatives-${toolSlug}`
  return (NEWSLETTER_SOURCES as readonly string[]).includes(source) ? (source as NewsletterSource) : null
}
