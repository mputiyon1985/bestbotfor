import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { dealMemberPriceIds, isDealMember, isLiveDeal, liveDealViews, parseMemberPriceIds, safeDealUrl, type DealRow } from './deals-view'
import { dealSeeds } from '@/data/deals.seed'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}))

const NOW = Date.UTC(2026, 9, 21)
const SECRET_CODE = 'SECRETCODE-9X7'
const SECRET_URL = 'https://vendor.example/deal?ref=secret-ref-123'

function deal(over: Partial<DealRow> = {}): DealRow {
  return {
    id: 1,
    toolSlug: 'cursor',
    vendor: 'Anysphere',
    title: 'Cursor Pro',
    discountText: '20% off the first year',
    code: SECRET_CODE,
    dealUrl: SECRET_URL,
    terms: 'New customers only.',
    startsAt: null,
    expiresAt: null,
    active: true,
    createdAt: NOW,
    ...over,
  }
}

describe('deal membership gate', () => {
  it('nobody is a member when the price-id flag is unset or malformed', () => {
    const subs = [{ status: 'active', stripePriceId: 'price_abc' }]
    expect(parseMemberPriceIds(undefined)).toEqual([])
    expect(parseMemberPriceIds(' , nope ,')).toEqual([])
    expect(isDealMember({ userId: 'u1', stripeConfigured: true, memberPriceIds: [], subscriptions: subs })).toBe(false)
  })

  it('needs a signed-in user, Stripe, and an active/trialing sub on a listed price', () => {
    const ids = parseMemberPriceIds('price_abc, price_def')
    const base = { userId: 'u1', stripeConfigured: true, memberPriceIds: ids }
    expect(isDealMember({ ...base, subscriptions: [{ status: 'active', stripePriceId: 'price_abc' }] })).toBe(true)
    expect(isDealMember({ ...base, subscriptions: [{ status: 'trialing', stripePriceId: 'price_def' }] })).toBe(true)
    expect(isDealMember({ ...base, subscriptions: [{ status: 'canceled', stripePriceId: 'price_abc' }] })).toBe(false)
    expect(isDealMember({ ...base, subscriptions: [{ status: 'active', stripePriceId: 'price_sponsor' }] })).toBe(false)
    expect(isDealMember({ ...base, userId: null, subscriptions: [{ status: 'active', stripePriceId: 'price_abc' }] })).toBe(false)
    expect(isDealMember({ ...base, stripeConfigured: false, subscriptions: [{ status: 'active', stripePriceId: 'price_abc' }] })).toBe(false)
  })
})

describe('deal gate uses the /pricing membership price IDs', () => {
  it('unions STRIPE_PRICE_MEMBER_ANNUAL/MONTHLY and DEALS_MEMBER_PRICE_IDS; all unset = nobody', () => {
    expect(dealMemberPriceIds({})).toEqual([])
    expect(dealMemberPriceIds({ STRIPE_PRICE_MEMBER_ANNUAL: 'price_a', STRIPE_PRICE_MEMBER_MONTHLY: 'price_m' })).toEqual(['price_a', 'price_m'])
    expect(dealMemberPriceIds({ STRIPE_PRICE_MEMBER_ANNUAL: 'price_a', DEALS_MEMBER_PRICE_IDS: 'price_a, price_x' })).toEqual(['price_a', 'price_x'])
  })
})

describe('live deals', () => {
  it('hides inactive, not-yet-started and expired deals', () => {
    expect(isLiveDeal(deal(), NOW)).toBe(true)
    expect(isLiveDeal(deal({ active: false }), NOW)).toBe(false)
    expect(isLiveDeal(deal({ startsAt: NOW + 1 }), NOW)).toBe(false)
    expect(isLiveDeal(deal({ expiresAt: NOW }), NOW)).toBe(false)
    expect(isLiveDeal(deal({ expiresAt: NOW + 1 }), NOW)).toBe(true)
  })

  it('only https deal links and a same-site /go path are rendered', () => {
    expect(safeDealUrl('javascript:alert(1)')).toBeNull()
    expect(safeDealUrl('http://vendor.example')).toBeNull()
    expect(safeDealUrl(SECRET_URL)).toBe(SECRET_URL)
    expect(safeDealUrl('/go/context-dev')).toBe('/go/context-dev')
    expect(safeDealUrl('/go/context-dev/extra')).toBeNull()
    expect(safeDealUrl('/go/context-dev?x=1')).toBeNull()
    expect(safeDealUrl('//go/context-dev')).toBeNull()
    expect(safeDealUrl('/go/../context-dev')).toBeNull()
  })
})

describe('server output never carries the code for non-members', () => {
  it('non-member views omit code, dealUrl and terms entirely', () => {
    const [view] = liveDealViews([deal()], false, NOW)
    expect(view).toBeDefined()
    expect(Object.keys(view!)).not.toEqual(expect.arrayContaining(['code']))
    expect(JSON.stringify(view)).not.toContain(SECRET_CODE)
    expect(JSON.stringify(view)).not.toContain('secret-ref-123')
  })

  it('the rendered teaser HTML has no code or link; the member HTML has both', async () => {
    const { DealList } = await import('@/components/deal-card')
    const locked = renderToStaticMarkup(createElement(DealList, { deals: liveDealViews([deal()], false, NOW) }))
    expect(locked).toContain('Members get 20% off the first year.')
    expect(locked).toContain('blur-sm')
    expect(locked).not.toContain(SECRET_CODE)
    expect(locked).not.toContain('vendor.example')
    const open = renderToStaticMarkup(createElement(DealList, { deals: liveDealViews([deal()], true, NOW) }))
    expect(open).toContain(SECRET_CODE)
    expect(open).toContain('href="https://vendor.example/deal?ref=secret-ref-123"')
  })

  it('shows the Context.dev deal on the tool list and the all-deals list, and hides the code from non-members', async () => {
    const { DealList } = await import('@/components/deal-card')
    const seed = dealSeeds[0]
    const row = deal({
      id: 7,
      toolSlug: seed.toolSlug,
      vendor: seed.vendor,
      title: seed.title,
      discountText: seed.discountText,
      code: seed.code,
      dealUrl: seed.dealUrl,
      terms: seed.terms,
      startsAt: seed.startsAt,
      expiresAt: seed.expiresAt,
      active: seed.active,
      createdAt: seed.createdAt,
    })
    const memberTool = renderToStaticMarkup(createElement(DealList, { deals: liveDealViews([row], true, seed.startsAt, 'context-dev') }))
    expect(memberTool).toContain('25% off for 6 months')
    expect(memberTool).toContain('MARK25OFF')
    expect(memberTool).toContain('href="/go/context-dev"')
    expect(memberTool).toContain('New Context.dev users get 25% off for their first 6 months with code MARK25OFF.')
    const memberList = renderToStaticMarkup(createElement(DealList, { deals: liveDealViews([row], true, seed.startsAt) }))
    expect(memberList).toContain('MARK25OFF')
    expect(memberList).toContain('href="/go/context-dev"')
    const locked = renderToStaticMarkup(createElement(DealList, { deals: liveDealViews([row], false, seed.startsAt, 'context-dev') }))
    expect(locked).toContain('Members get 25% off for 6 months.')
    expect(locked).not.toContain('MARK25OFF')
    expect(locked).not.toContain('/go/context-dev')
    expect(liveDealViews([row], true, seed.startsAt, 'other-tool')).toEqual([])
  })
})
