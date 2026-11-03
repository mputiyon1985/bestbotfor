import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  dbAffiliateUrl: null as string | null,
  status: 'inactive',
  network: null as string | null,
  fail: false,
  inserted: [] as Array<Record<string, unknown>>,
  returnId: 42,
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: () => {} }
})
vi.mock('@/lib/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        let ran = false
        const run = () => {
          if (ran) return
          ran = true
          state.inserted.push(row)
        }
        return {
          then(onFulfilled?: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) {
            return Promise.resolve().then(run).then(() => undefined, onRejected).then(onFulfilled, onRejected)
          },
          returning: () =>
            Promise.resolve().then(() => {
              run()
              return [{ id: state.returnId }]
            }),
        }
      },
    }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: () => Promise.resolve({ ok: true, remaining: 1, resetAt: 0 }) }))
vi.mock('@/lib/catalog', () => ({
  getTool: (slug: string) => {
    if (state.fail) return Promise.reject(new Error('deadline'))
    const official = slug === 'elevenlabs' ? 'https://elevenlabs.io' : 'https://www.synthesia.io'
    return Promise.resolve({
      id: slug === 'elevenlabs' ? 11 : 9,
      url: official,
      affiliate: { affiliateUrl: state.dbAffiliateUrl, status: state.status, network: state.network },
    })
  },
}))

import { GET } from './route'
import { servesAffiliateLink } from '@/lib/go-redirect'

const go = (slug: string, search = '') =>
  GET(new Request(`https://bestbotfor.com/go/${slug}${search}`), { params: Promise.resolve({ slug }) })

afterEach(() => {
  state.dbAffiliateUrl = null
  state.status = 'inactive'
  state.network = null
  state.fail = false
  state.inserted = []
  state.returnId = 42
})

describe('/go inactive programs', () => {
  it('sends Synthesia to the official site when the program is switched off', async () => {
    const res = await go('synthesia')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://www.synthesia.io/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
    expect(res.headers.get('location')).not.toContain('via=')
    expect(servesAffiliateLink('synthesia', null, 'inactive')).toBe(false)
  })

  it('keeps the official site when the catalog read fails, and keeps utm_* passthrough', async () => {
    state.fail = true
    const res = await go('synthesia', '?utm_source=guide&x=1')
    expect(res.headers.get('location')).toBe('https://www.synthesia.io/?utm_source=guide')
  })

  it('ignores a stored affiliate URL while status is not active, and an off-list URL when it is', async () => {
    state.dbAffiliateUrl = 'https://www.synthesia.io/?via=example'
    expect((await go('synthesia')).headers.get('location')).toBe('https://www.synthesia.io/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
    state.inserted = []
    state.status = 'active'
    state.dbAffiliateUrl = 'https://evil.example/aff'
    expect((await go('synthesia')).headers.get('location')).toBe('https://www.synthesia.io/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
  })

  it('sends ElevenLabs to the official site, not a tracking link', async () => {
    const res = await go('elevenlabs')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://elevenlabs.io/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
    expect(servesAffiliateLink('elevenlabs', null, 'inactive')).toBe(false)
  })
})

describe('/go active SubID', () => {
  it('appends a PartnerStack sid of page plus click id and records the program', async () => {
    state.status = 'active'
    state.network = 'PartnerStack'
    state.dbAffiliateUrl = 'https://partnerstack.com/elevenlabs?p=1'
    state.returnId = 42
    const res = await GET(
      new Request('https://bestbotfor.com/go/elevenlabs', { headers: { referer: 'https://bestbotfor.com/best/voice' } }),
      { params: Promise.resolve({ slug: 'elevenlabs' }) },
    )
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.hostname).toBe('partnerstack.com')
    expect(location.searchParams.get('p')).toBe('1')
    expect(location.searchParams.get('sid')).toBe('/best/voice.42')
    expect(location.searchParams.get('utm_source')).toBe('bestbotfor')
    expect(state.inserted).toEqual([
      expect.objectContaining({ toolId: 11, affiliate: true, programId: 11, page: '/best/voice' }),
    ])
  })
})
