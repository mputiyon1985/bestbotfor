import { afterEach, describe, expect, it, vi } from 'vitest'

const subscribeToNewsletter = vi.fn()

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/newsletter', () => ({ subscribeToNewsletter: (input: unknown) => subscribeToNewsletter(input) }))

import { subscribeAction } from './actions'

afterEach(() => subscribeToNewsletter.mockReset())

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const idle = { status: 'idle' as const, message: '', tracked: false }

describe('subscribeAction first_touch wiring (Sentinel P3-1 on #101)', () => {
  it('passes the posted first_touch through parseFirstTouch, not the raw value', async () => {
    subscribeToNewsletter.mockResolvedValue({ status: 'success', message: 'ok', tracked: false })
    const at = new Date().toISOString()
    const raw = JSON.stringify({
      utm_source: 'face<b>book',
      utm_medium: 'social',
      landing_path: '//evil.example/x?email=a@b.c',
      email: 'smuggled@example.com',
      reactivate_existing: true,
      at,
    })
    await subscribeAction(idle, form({ email: 'reader@example.com', first_touch: raw }))
    expect(subscribeToNewsletter).toHaveBeenCalledTimes(1)
    const input = subscribeToNewsletter.mock.calls[0]?.[0] as { firstTouch: unknown }
    expect(input.firstTouch).toEqual({ utm_source: 'facebbook', utm_medium: 'social', landing_path: '/', at })
  })

  it('passes null for a missing, malformed, tagless, or expired first_touch', async () => {
    subscribeToNewsletter.mockResolvedValue({ status: 'success', message: 'ok', tracked: false })
    const expired = JSON.stringify({ utm_source: 'x', landing_path: '/', at: new Date(Date.now() - 91 * 86_400_000).toISOString() })
    for (const value of [undefined, '{not json', JSON.stringify({ landing_path: '/' }), expired]) {
      await subscribeAction(idle, form(value === undefined ? { email: 'r@example.com' } : { email: 'r@example.com', first_touch: value }))
    }
    expect(subscribeToNewsletter.mock.calls.map((call) => (call[0] as { firstTouch: unknown }).firstTouch)).toEqual([null, null, null, null])
  })
})

describe('subscribeAction cta_path (newsletter CTA)', () => {
  const original = { cta: process.env.NEWSLETTER_CTA, env: process.env.VERCEL_ENV }
  afterEach(() => {
    if (original.cta === undefined) delete process.env.NEWSLETTER_CTA
    else process.env.NEWSLETTER_CTA = original.cta
    if (original.env === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = original.env
  })

  it('passes a valid page path as referringPath when the flag is on', async () => {
    process.env.NEWSLETTER_CTA = 'on'
    process.env.VERCEL_ENV = 'test'
    subscribeToNewsletter.mockResolvedValue({ status: 'success', message: 'ok', tracked: false })
    await subscribeAction(idle, form({ email: 'a@example.com', source: 'best', cta_path: '/best/music' }))
    expect(subscribeToNewsletter.mock.calls[0]?.[0]).toMatchObject({ source: 'best', referringPath: '/best/music' })
    await subscribeAction(idle, form({ email: 'a@example.com', source: 'best', cta_path: '//evil.example/x' }))
    expect(subscribeToNewsletter.mock.calls[1]?.[0]).toMatchObject({ referringPath: undefined })
  })

  it('ignores cta_path when the flag is off', async () => {
    delete process.env.NEWSLETTER_CTA
    process.env.VERCEL_ENV = 'production'
    subscribeToNewsletter.mockResolvedValue({ status: 'success', message: 'ok', tracked: false })
    await subscribeAction(idle, form({ email: 'a@example.com', source: 'best', cta_path: '/best/music' }))
    expect(subscribeToNewsletter.mock.calls[0]?.[0]).toMatchObject({ referringPath: undefined })
  })

  it('accepts cta_path in production once launched and NEWSLETTER_CTA=on', async () => {
    process.env.NEWSLETTER_CTA = 'on'
    process.env.VERCEL_ENV = 'production'
    subscribeToNewsletter.mockResolvedValue({ status: 'success', message: 'ok', tracked: false })
    await subscribeAction(idle, form({ email: 'a@example.com', source: 'best', cta_path: '/best/music' }))
    expect(subscribeToNewsletter.mock.calls[0]?.[0]).toMatchObject({ referringPath: '/best/music' })
  })
})
