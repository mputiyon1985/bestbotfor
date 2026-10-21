import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userId: 'user_1' as string | null, subs: [{ status: 'active', stripePriceId: 'price_member' }] }))
const SECRET = 'PAGE-SECRET-42'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}))
vi.mock('@/lib/stripe', () => ({ isStripeConfigured: () => true }))
vi.mock('@/lib/members', () => ({ currentClerkUserId: async () => state.userId }))
vi.mock('@/lib/db', () => {
  const deals = [
    { id: 1, toolSlug: 'cursor', vendor: 'V', title: 'T', discountText: '10% off', code: SECRET, dealUrl: 'https://v.example/x', terms: null, startsAt: null, expiresAt: null, active: true, createdAt: 0 },
  ]
  return {
    getDb: () => ({
      select: (fields?: unknown) => ({
        from: () => ({ where: async () => (fields ? state.subs : deals) }),
      }),
    }),
  }
})

afterEach(() => {
  delete process.env.DEALS_MEMBER_PRICE_IDS
  state.userId = 'user_1'
})

async function render() {
  const { default: DealsPage } = await import('@/app/deals/page')
  return renderToStaticMarkup(await DealsPage())
}

describe('/deals response', () => {
  it('flag unset: even an active subscriber gets only the teaser', async () => {
    const html = await render()
    expect(html).toContain('Members get 10% off.')
    expect(html).not.toContain(SECRET)
    expect(html).not.toContain('v.example')
  })

  it('flag set but signed out: teaser only', async () => {
    process.env.DEALS_MEMBER_PRICE_IDS = 'price_member'
    state.userId = null
    const html = await render()
    expect(html).not.toContain(SECRET)
  })

  it('flag set and active member on a listed price: code and link shown', async () => {
    process.env.DEALS_MEMBER_PRICE_IDS = 'price_member'
    const html = await render()
    expect(html).toContain(SECRET)
    expect(html).toContain('https://v.example/x')
  })
})
