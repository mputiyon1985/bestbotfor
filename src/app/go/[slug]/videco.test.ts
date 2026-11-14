import { afterEach, describe, expect, it, vi } from 'vitest'

const TRACKING = 'https://videco.io?via=mark276'

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
    if (slug !== 'videco') return Promise.resolve(null)
    return Promise.resolve({
      id: 42,
      url: 'https://videco.io',
      affiliate: { affiliateUrl: TRACKING, status: 'active', network: 'Endorsely' },
    })
  },
}))

import { GET, HEAD } from './route'

const go = (slug: string, search = '') =>
  GET(new Request(`https://bestbotfor.com/go/${slug}${search}`), { params: Promise.resolve({ slug }) })

afterEach(() => {
  state.loaded = []
})

describe('/go/videco', () => {
  it('redirects to the exact Endorsely link and drops any inbound query', async () => {
    for (const search of ['', '?utm_source=guide&x=1', '?ref=other']) {
      state.loaded = []
      const res = await go('videco', search)
      expect(res.status, search).toBe(302)
      expect(res.headers.get('location'), search).toBe(TRACKING)
      expect(state.loaded, search).toEqual(['videco'])
    }
  })

  it('HEAD stays on the official site', async () => {
    const res = await HEAD(new Request('https://bestbotfor.com/go/videco', { method: 'HEAD' }), {
      params: Promise.resolve({ slug: 'videco' }),
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://videco.io/')
    expect(state.loaded).toEqual([])
  })
})
