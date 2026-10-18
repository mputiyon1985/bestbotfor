/** In-memory only. The key is a hash from the action. This map is never written to the database. */
const buckets = new Map<string, { count: number; resetAt: number }>()

export const SUGGESTION_RATE_LIMIT = 5
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000

export function resetSuggestionRates(): void {
  buckets.clear()
}

/** True when this key may submit. A full window returns false and stores nothing. */
export function allowSuggestionRate(key: string, now = Date.now()): boolean {
  const current = buckets.get(key)
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + SUGGESTION_RATE_WINDOW_MS })
    return true
  }
  if (current.count >= SUGGESTION_RATE_LIMIT) return false
  current.count += 1
  return true
}
