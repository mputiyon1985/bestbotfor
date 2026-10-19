/**
 * First-touch attribution (James, Oct 19, 2026). On the first visit that
 * carries utm_* tags we keep the tags and the landing path in first-party
 * localStorage. Nothing is written when the URL has no tags, and an existing
 * entry is never overwritten. This does not depend on analytics consent: it is
 * a functional first-party record that never leaves the browser unless the
 * visitor joins the newsletter or creates an account. Every value is
 * sanitized and length-capped on write and again on read (the server
 * re-sanitizes anything the browser sends).
 */

export const FIRST_TOUCH_STORAGE_KEY = 'bbf_first_touch'
export const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const
export type UtmField = (typeof UTM_FIELDS)[number]

export const UTM_VALUE_MAX = 100
export const LANDING_PATH_MAX = 200
/** Upper bound on the serialized record a form may post. */
export const FIRST_TOUCH_JSON_MAX = 1024

export type FirstTouch = Partial<Record<UtmField, string>> & {
  landing_path: string
  /** ISO time the record was written. */
  at?: string
}

/** Letters, digits, and a few safe separators. Everything else is dropped. */
export function sanitizeUtmValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9 ._~+-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, UTM_VALUE_MAX)
    .trim()
  return cleaned.length > 0 ? cleaned : null
}

/** Same-site path only: starts with one slash, no query, no hash. */
export function sanitizeLandingPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  const path = value.split(/[?#]/, 1)[0] ?? ''
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  const cleaned = path.replace(/[^A-Za-z0-9/._~-]/g, '').slice(0, LANDING_PATH_MAX)
  return cleaned.startsWith('/') && !cleaned.startsWith('//') ? cleaned : '/'
}

function sanitizeAt(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 40) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

/** Tags from a landing URL. Null when the URL carries none of the four tags. */
export function firstTouchFromUrl(search: string, pathname: string, now: Date = new Date()): FirstTouch | null {
  const params = new URLSearchParams(search)
  const record: FirstTouch = { landing_path: sanitizeLandingPath(pathname) }
  let found = false
  for (const field of UTM_FIELDS) {
    const value = sanitizeUtmValue(params.get(field))
    if (value) {
      record[field] = value
      found = true
    }
  }
  if (!found) return null
  record.at = now.toISOString()
  return record
}

/** Parses and re-sanitizes a stored or posted record. Null when it holds no tags. */
export function parseFirstTouch(raw: unknown): FirstTouch | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > FIRST_TOUCH_JSON_MAX) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const input = data as Record<string, unknown>
  const record: FirstTouch = { landing_path: sanitizeLandingPath(input.landing_path) }
  let found = false
  for (const field of UTM_FIELDS) {
    const value = sanitizeUtmValue(input[field])
    if (value) {
      record[field] = value
      found = true
    }
  }
  if (!found) return null
  const at = sanitizeAt(input.at)
  if (at) record.at = at
  return record
}

/** Values sent to Beehiiv. The fixed pair is used only when nothing was recorded. */
export const FALLBACK_UTM = { utm_source: 'bestbotfor', utm_medium: 'website' } as const

export function beehiivUtmFields(firstTouch: FirstTouch | null | undefined): Partial<Record<UtmField, string>> {
  if (!firstTouch) return { ...FALLBACK_UTM }
  const fields: Partial<Record<UtmField, string>> = {}
  for (const field of UTM_FIELDS) {
    const value = sanitizeUtmValue(firstTouch[field])
    if (value) fields[field] = value
  }
  return Object.keys(fields).length > 0 ? fields : { ...FALLBACK_UTM }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function safeStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Writes the record only if nothing valid is stored yet. Returns what is stored after the call. */
export function captureFirstTouch(
  location: { search: string; pathname: string },
  storage?: StorageLike,
  now: Date = new Date(),
): FirstTouch | null {
  const store = safeStorage(storage)
  if (!store) return null
  try {
    const existing = parseFirstTouch(store.getItem(FIRST_TOUCH_STORAGE_KEY))
    if (existing) return existing
    const record = firstTouchFromUrl(location.search, location.pathname, now)
    if (!record) return null
    store.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(record))
    return record
  } catch {
    return null
  }
}

export function readFirstTouch(storage?: StorageLike): FirstTouch | null {
  const store = safeStorage(storage)
  if (!store) return null
  try {
    return parseFirstTouch(store.getItem(FIRST_TOUCH_STORAGE_KEY))
  } catch {
    return null
  }
}
