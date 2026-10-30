import 'server-only'
import { unstable_cache } from 'next/cache'

export const REVALIDATE_SECONDS = 300

type Entry = { expiresAt: number; value: unknown }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export function resetCacheForTests(): void {
  store.clear()
  inflight.clear()
}

/**
 * Per-instance TTL plus Next.js data cache. A hit inside the revalidate
 * window does not call the loader again. Loaded only when a page or export
 * asks for it. Nothing here polls.
 */
export function cached<T>(key: string, fn: () => Promise<T>): () => Promise<T> {
  const nextCached = unstable_cache(fn, [key], { revalidate: REVALIDATE_SECONDS })
  return async () => {
    const now = Date.now()
    const hit = store.get(key)
    if (hit && hit.expiresAt > now) return hit.value as T
    let pending = inflight.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = nextCached()
        .then((value) => {
          store.set(key, { value, expiresAt: Date.now() + REVALIDATE_SECONDS * 1000 })
          return value
        })
        .finally(() => {
          inflight.delete(key)
        })
      inflight.set(key, pending)
    }
    return pending
  }
}
