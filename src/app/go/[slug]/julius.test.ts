import { afterEach, describe, expect, it, vi } from 'vitest'

const TRACKING = 'https://julius.dub.link/mark-putiyon'

const state = vi.hoisted(() => ({
  loaded: [] as string[],
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: () => {} }
})
vi.mock('@/lib/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: () => Promise.resolve({ ok: true, remaining: 1, resetAt: 0 }) }))
vi.mock('@/lib/catalog', () => ({
  getTool: (slug: string) => {
    state.loaded.push(slug)
    if (slug !== 'julius-ai') return Promise.resolve(null)
    return Promise.resolve({
      id: 42,
      url: 'https://julius.ai',
      affiliate: { affiliateUrl: 'https://julius.dub.link/mark-putiyon', status: 'active', network: null },
    })
  },
}))

import { GET, HEAD } from './route'

const go = (slug: string, search = '') =>
  GET(new Request(`https://bestbotfor.com/go/${slug}${search}`), { params: Promise.resolve({ slug }) })

afterEach(() => {
  state.loaded = []
})

describe('/go/julius', () => {
  it('redirects to the exact Dub link and loads the Julius AI catalog row', async () => {
    for (const search of ['', '?utm_source=guide&x=1', '?ref=other']) {
      state.loaded = []
      const res = await go('julius', search)
      expect(res.status, search).toBe(302)
      expect(res.headers.get('location'), search).toBe(TRACKING)
      expect(state.loaded, search).toEqual(['julius-ai'])
    }

    const catalogSlug = await go('julius-ai')
    expect(catalogSlug.status).toBe(302)
    expect(catalogSlug.headers.get('location')).toBe(TRACKING)
  })

  it('HEAD stays on the official site', async () => {
    const res = await HEAD(new Request('https://bestbotfor.com/go/julius', { method: 'HEAD' }), {
      params: Promise.resolve({ slug: 'julius' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://julius.ai/')
    expect(state.loaded).toEqual([])
  })
})
