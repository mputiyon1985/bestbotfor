import { readConsent } from './consent'

export const ANALYTICS_EVENTS = ['quiz_start', 'quiz_complete', 'affiliate_click', 'newsletter_signup', 'sign_up'] as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/** Params allowed only on one event. newsletter_signup.source: a source slug or in-scope page path, never an email or query. */
const EVENT_PARAM_RULES: Partial<Record<AnalyticsEvent, Record<string, RegExp>>> = {
  newsletter_signup: { source: /^\/?[a-z0-9]+(?:[-/][a-z0-9]+)*$/ },
}

const PARAM_RULES: Record<string, RegExp> = {
  task: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  budget: /^(free|low|any)$/,
  skill: /^(beginner|intermediate|pro)$/,
  tool: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  method: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
}

/**
 * Sends a GA4 event only after the visitor has accepted analytics and gtag
 * exists. Params are an allowlist of non-identifying slugs. Email, names,
 * and free-text queries are dropped. Returns false when nothing was sent.
 */
export function track(event: AnalyticsEvent, params?: Record<string, string>): boolean {
  if (typeof window === 'undefined') return false
  if (readConsent() !== 'granted') return false
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtag !== 'function') return false
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(params ?? {})) {
    const rule = EVENT_PARAM_RULES[event]?.[key] ?? PARAM_RULES[key]
    if (!rule || !rule.test(value)) continue
    safe[key] = value
  }
  gtag('event', event, safe)
  return true
}
