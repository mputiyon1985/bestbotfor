/**
 * Newsletter CTA helpers (inline box + sticky bar). Pure, safe on server and client.
 */

export const NEWSLETTER_CTA_DISMISS_KEY = 'bbf_newsletter_cta_dismissed'
export const NEWSLETTER_CTA_DISMISS_DAYS = 7
export const NEWSLETTER_CTA_DISMISS_MS = NEWSLETTER_CTA_DISMISS_DAYS * 24 * 60 * 60 * 1000
/** Fraction of the page scrolled before the sticky bar appears. */
export const NEWSLETTER_CTA_SCROLL_FRACTION = 0.4

const CTA_PATH = /^\/(compare|alternatives|best|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/free)?$/
const CTA_PATH_MAX = 200

/** The page path the CTA posts as its signup source, or null when it is not an in-scope page. */
export function parseNewsletterCtaPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > CTA_PATH_MAX) return null
  return CTA_PATH.test(value) ? value : null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>

function store(storage?: StorageLike): StorageLike | null {
  if (storage) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** True while a dismissal from the last 7 days is stored. An expired or corrupt entry is removed. */
export function isNewsletterCtaDismissed(storage?: StorageLike, now: number = Date.now()): boolean {
  const s = store(storage)
  if (!s) return false
  try {
    const raw = s.getItem(NEWSLETTER_CTA_DISMISS_KEY)
    if (raw === null) return false
    const at = Number(raw)
    if (Number.isFinite(at) && at <= now + 60_000 && now - at < NEWSLETTER_CTA_DISMISS_MS) return true
    s.removeItem?.(NEWSLETTER_CTA_DISMISS_KEY)
    return false
  } catch {
    return false
  }
}

export function dismissNewsletterCta(storage?: StorageLike, now: number = Date.now()): void {
  const s = store(storage)
  if (!s) return
  try {
    s.setItem(NEWSLETTER_CTA_DISMISS_KEY, String(now))
  } catch {
    // Storage full or blocked: the bar still closes for this page view.
  }
}

/** Sticky bar shows once the visitor has scrolled past the threshold. */
export function scrolledPastThreshold(scrollY: number, viewportHeight: number, documentHeight: number): boolean {
  const scrollable = documentHeight - viewportHeight
  if (scrollable <= 0) return false
  return scrollY / scrollable >= NEWSLETTER_CTA_SCROLL_FRACTION
}
