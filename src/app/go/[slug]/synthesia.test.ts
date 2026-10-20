import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ dbAffiliateUrl: null as string | null, fail: false }))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: () => {} }
})
vi.mock('@/lib/db', () => ({ getDb: () => ({ insert: () => ({ values: () => Promise.resolve() }) }) }))
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: () => Promise.resolve({ ok: true, remaining: 1, resetAt: 0 }) }))
vi.mock('@/lib/catalog', () => ({
  getTool: () =>
    state.fail
      ? Promise.reject(new Error('deadline'))
      : Promise.resolve({ id: 9, url: 'https://www.synthesia.io', affiliate: { affiliateUrl: state.dbAffiliateUrl } }),
}))

import { GET } from './route'
import { servesAffiliateLink } from '@/lib/go-redirect'

const AFFILIATE = 'https://www.synthesia.io/?via=mark-putiyon'
const go = (search = '') =>
  GET(new Request(`https://bestbotfor.com/go/synthesia${search}`), { params: Promise.resolve({ slug: 'synthesia' }) })

afterEach(() => {
  state.dbAffiliateUrl = null
  state.fail = false
})

describe('/go/synthesia', () => {
  it('redirects to the reviewed affiliate URL with no DB affiliate_url', async () => {
    const res = await go()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(AFFILIATE)
    expect(servesAffiliateLink('synthesia', null)).toBe(true)
  })

  it('still uses it when the catalog read fails, and keeps utm_* passthrough', async () => {
    state.fail = true
    const res = await go('?utm_source=guide&x=1')
    expect(res.headers.get('location')).toBe(`${AFFILIATE}&utm_source=guide`)
  })

  it('a DB affiliate_url still wins, and an off-list one falls back to the official site', async () => {
    state.dbAffiliateUrl = 'https://evil.example/aff'
    expect((await go()).headers.get('location')).toBe('https://www.synthesia.io/')
  })
})

describe('/go/elevenlabs', () => {
  it('redirects to the reviewed ElevenLabs affiliate URL', async () => {
    const res = await GET(new Request('https://bestbotfor.com/go/elevenlabs'), { params: Promise.resolve({ slug: 'elevenlabs' }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://try.elevenlabs.io/8hbaa9knuwda')
    expect(servesAffiliateLink('elevenlabs', null)).toBe(true)
  })
})
