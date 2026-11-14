import { afterEach, describe, expect, it, vi } from 'vitest'

const MAIN = 'https://docsalot.dev/?utm-source=bestbotfor'
const STARTUP = 'https://buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08'
const TEAM = 'https://buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07'

const state = vi.hoisted(() => ({
  loaded: [] as string[],
  status: 'active',
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
    if (slug !== 'docsalot') return Promise.resolve(null)
    return Promise.resolve({
      id: 42,
      url: 'https://docsalot.dev',
      affiliate: { affiliateUrl: MAIN, status: state.status, network: null },
    })
  },
}))

import { GET, HEAD } from './route'

const go = (slug: string, search = '') =>
  GET(new Request(`https://bestbotfor.com/go/${slug}${search}`), { params: Promise.resolve({ slug }) })

afterEach(() => {
  state.loaded = []
  state.status = 'active'
})

describe('/go/docsalot plan aliases', () => {
  it('keeps /go/docsalot on the main tracking URL and sends the plan slugs to the pinned checkouts', async () => {
    const plans = { 'docsalot-startup': STARTUP, 'docsalot-team': TEAM } as const
    for (const search of ['', '?utm_source=guide&x=1', '?ref=other']) {
      state.loaded = []
      const main = await go('docsalot', search)
      expect(main.status, search).toBe(302)
      expect(main.headers.get('location'), search).toBe(MAIN)
      expect(state.loaded, search).toEqual(['docsalot'])
    }
    for (const [slug, tracking] of Object.entries(plans)) {
      for (const search of ['', '?utm_source=guide&x=1', '?ref=other']) {
        state.loaded = []
        const res = await go(slug, search)
        expect(res.status, `${slug}${search}`).toBe(302)
        expect(res.headers.get('location'), `${slug}${search}`).toBe(tracking)
        expect(state.loaded, `${slug}${search}`).toEqual(['docsalot'])
      }
    }
  })

  it('HEAD stays on the official site for the main slug and both plan aliases', async () => {
    for (const slug of ['docsalot', 'docsalot-startup', 'docsalot-team']) {
      const res = await HEAD(new Request(`https://bestbotfor.com/go/${slug}`, { method: 'HEAD' }), {
        params: Promise.resolve({ slug }),
      })
      expect(res.status, slug).toBe(302)
      expect(res.headers.get('location'), slug).toBe('https://docsalot.dev/')
    }
    expect(state.loaded).toEqual([])
  })

  it('sends the plan aliases to the official site when the program is not active', async () => {
    state.status = 'inactive'
    const res = await go('docsalot-startup', '?utm_source=x')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://docsalot.dev/?utm_source=x')
    expect(state.loaded).toEqual(['docsalot'])
  })
})
