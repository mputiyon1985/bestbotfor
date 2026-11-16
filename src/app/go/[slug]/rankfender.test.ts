import { afterEach, describe, expect, it, vi } from 'vitest'

const TRACKING = 'https://rankfender.com/r/mark'

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
    if (slug !== 'rankfender') return Promise.resolve(null)
    return Promise.resolve({
      id: 42,
      url: 'https://rankfender.com',
      affiliate: { affiliateUrl: 'https://rankfender.com/r/mark', status: 'active', network: null },
    })
  },
}))

import { GET, HEAD } from './route'

const go = (slug: string, search = '') =>
  GET(new Request(`https://bestbotfor.com/go/${slug}${search}`), { params: Promise.resolve({ slug }) })

afterEach(() => {
  state.loaded = []
})

describe('/go/rankfender', () => {
  it('redirects to the exact tracking link and loads the Rankfender catalog row', async () => {
    for (const search of ['', '?utm_source=guide&x=1', '?ref=other']) {
      state.loaded = []
      const res = await go('rankfender', search)
      expect(res.status, search).toBe(302)
      expect(res.headers.get('location'), search).toBe(TRACKING)
      expect(state.loaded, search).toEqual(['rankfender'])
    }
  })

  it('HEAD stays on the official site', async () => {
    const res = await HEAD(new Request('https://bestbotfor.com/go/rankfender', { method: 'HEAD' }), {
      params: Promise.resolve({ slug: 'rankfender' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://rankfender.com/')
    expect(state.loaded).toEqual([])
  })
})
