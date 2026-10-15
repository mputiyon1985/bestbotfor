export const ANALYTICS_EVENTS = ['quiz_start', 'quiz_complete', 'affiliate_click', 'newsletter_signup'] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

const PARAM_RULES: Record<string, RegExp> = {
  task: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  budget: /^(free|low|any)$/,
  skill: /^(beginner|intermediate|pro)$/,
  tool: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
}

/**
 * Sends a GA4 event only when gtag exists. Params are an allowlist of
 * non-identifying slugs. Email, names, and free-text queries are dropped.
 */
export function track(event: AnalyticsEvent, params?: Record<string, string>): void {
  if (typeof window === 'undefined') return
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtag !== 'function') return
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(params ?? {})) {
    const rule = PARAM_RULES[key]
    if (!rule || !rule.test(value)) continue
    safe[key] = value
  }
  gtag('event', event, safe)
}
