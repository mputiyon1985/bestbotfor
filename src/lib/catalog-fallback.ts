import 'server-only'

import { unstable_rethrow } from 'next/navigation'

/**
 * Last-known-good values per read, kept in this server instance's memory.
 * Bounded so a stream of unique search queries cannot grow it without limit.
 * Only public catalog content goes through here (no user, member or sponsor data).
 */
const MAX_ENTRIES = 500
const lastGood = new Map<string, unknown>()

export class CatalogUnavailableError extends Error {
  constructor(name: string) {
    super(`Catalog read "${name}" is unavailable and no fallback exists`)
    this.name = 'CatalogUnavailableError'
  }
}

function keyFor(name: string, args: readonly unknown[]): string {
  return `${name}:${JSON.stringify(args)}`
}

function remember(key: string, value: unknown) {
  lastGood.delete(key)
  lastGood.set(key, value)
  while (lastGood.size > MAX_ENTRIES) {
    const oldest = lastGood.keys().next().value
    if (oldest === undefined) break
    lastGood.delete(oldest)
  }
}

/**
 * Runs a (cached) catalog read. When it throws (e.g. Turso blocking reads at the
 * plan limit, or a network error), serve the last good value for the same
 * arguments, then the seed fallback (the bundled read-only catalog-fallback.db). Only when neither
 * exists does it throw CatalogUnavailableError, which the error boundary renders.
 * The fallback is never written into the Next data cache, so a short outage
 * cannot pin stale or empty data for the whole revalidate window.
 */
export async function withReadFallback<Args extends unknown[], Result>(
  name: string,
  args: Args,
  read: (...args: Args) => Promise<Result>,
  seed?: () => Result | Promise<Result>,
): Promise<Result> {
  const key = keyFor(name, args)
  try {
    const value = await read(...args)
    remember(key, value)
    return value
  } catch (error) {
    // notFound(), redirect() and dynamic-rendering bailouts are control flow, not DB errors.
    unstable_rethrow(error)
    // Log the error class only: driver messages can include the database URL.
    console.error(`[catalog] read "${name}" failed (${error instanceof Error ? error.name : 'unknown'}); serving fallback`)
    if (lastGood.has(key)) {
      const value = lastGood.get(key) as Result
      remember(key, value) // refresh recency so hot pages survive search churn
      return value
    }
    if (seed) {
      try {
        return await seed()
      } catch (fallbackError) {
        console.error(`[catalog] fallback for "${name}" failed (${fallbackError instanceof Error ? fallbackError.name : 'unknown'})`)
      }
    }
    throw new CatalogUnavailableError(name)
  }
}

/** Test helper. */
export function resetCatalogFallbackForTests() {
  lastGood.clear()
}
