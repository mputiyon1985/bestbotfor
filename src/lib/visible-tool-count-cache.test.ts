import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  queries: 0,
  failLive: false,
  fallbackDb: null as unknown,
  registrations: [] as { keys: string[]; revalidate?: number | false }[],
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options?: { revalidate?: number | false }) => {
    state.registrations.push({ keys: [...keyParts], revalidate: options?.revalidate })
    let cached: Promise<unknown> | undefined
    return () => {
      cached ??= Promise.resolve().then(fn)
      return cached
    }
  },
}))

vi.mock('./db', () => ({
  getDb: () => {
    if (state.failLive) throw Object.assign(new Error('SQL read operations are forbidden (BLOCKED)'), { name: 'LibsqlError' })
    return {
      select: () => ({
        from: () => ({
          where: () => {
            state.queries += 1
            return Promise.resolve([{ total: 1260 }])
          },
        }),
      }),
    }
  },
}))

vi.mock('./catalog-fallback-db', () => ({
  getCatalogFallbackDb: () => state.fallbackDb,
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITEST', 'false')
  state.queries = 0
  state.failLive = false
  state.fallbackDb = null
  state.registrations.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function toolRow(id: number, slug: string, status: string) {
  return {
    id,
    slug,
    name: slug,
    vendor: slug,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${slug} short.`,
    longDesc: `${slug} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: 20,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: '["Web"]',
    lastVerifiedAt: '2026-10-15',
    status,
  }
}

function expectedCount(count: number, word: string): string {
  const formatted = new Intl.NumberFormat('en-US').format(count)
  const noun = count === 1 ? 'tool' : 'tools'
  return `${formatted} AI ${noun} ${word}`
}

describe('cached visible tool count', () => {
  it('reads the database once for repeated calls and revalidates hourly', async () => {
    const { getVisibleToolCount, CATALOG_PAGE_REVALIDATE_SECONDS } = await import('./catalog')
    const { VISIBLE_TOOL_COUNT_WORD, visibleToolCountLabel } = await import('./visible-tool-count')
    expect(await getVisibleToolCount()).toBe(1260)
    expect(await getVisibleToolCount()).toBe(1260)
    expect(await visibleToolCountLabel()).toBe(expectedCount(1260, VISIBLE_TOOL_COUNT_WORD))
    expect(await visibleToolCountLabel()).toBe(expectedCount(1260, VISIBLE_TOOL_COUNT_WORD))
    expect(state.queries).toBe(1)
    const registered = state.registrations.find((entry) => entry.keys[0] === 'visible-tool-count-v1')
    expect(registered?.revalidate).toBe(60 * 60)
    expect(registered?.revalidate).toBe(CATALOG_PAGE_REVALIDATE_SECONDS)
    expect(registered?.keys[1]).toMatch(/^catalog-version:/)
  })

  it('uses the fallback database when the live read fails, and still skips an unlisted tool', async () => {
    const { createTestDatabase } = await import('@/test/db')
    const { tools } = await import('./db/schema')
    const { db, close } = await createTestDatabase()
    try {
      await db.insert(tools).values([
        toolRow(1, 'alpha', 'active'),
        toolRow(2, 'beta', 'active'),
        toolRow(3, 'gone', 'unlisted'),
      ])
      state.failLive = true
      state.fallbackDb = db
      const { VISIBLE_TOOL_COUNT_WORD, visibleToolCountLabel } = await import('./visible-tool-count')
      expect(await visibleToolCountLabel()).toBe(expectedCount(2, VISIBLE_TOOL_COUNT_WORD))
      expect(await visibleToolCountLabel()).toBe(expectedCount(2, VISIBLE_TOOL_COUNT_WORD))
      expect(state.queries).toBe(0)
    } finally {
      await close()
    }
  })

  it('hides the line when the live read and the fallback database both fail', async () => {
    state.failLive = true
    state.fallbackDb = null
    const { visibleToolCountLabel } = await import('./visible-tool-count')
    await expect(visibleToolCountLabel()).resolves.toBeNull()
    await expect(visibleToolCountLabel()).resolves.toBeNull()
    expect(state.queries).toBe(0)
  })
})
