import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/sponsor/checkout/route'
import { sponsorCheckoutAction } from '@/app/sponsor/actions'
import SponsorPage from '@/app/sponsor/page'
import { resetStripeCache } from '@/lib/stripe'
import {
  SPONSOR_CONTACT_MAILTO,
  SPONSOR_OPENING_SOON,
  sponsorCheckoutSurface,
  sponsorLiveBilling,
} from './sponsor-checkout-gate'

const liveKey = ['sk', 'live', 'example'].join('_')
const restrictedLiveKey = ['rk', 'live', 'example'].join('_')
const testKey = ['sk', 'test', 'example'].join('_')
const allowLive = ['tr', 'ue'].join('')

const ENV_KEYS = [
  'VERCEL_ENV',
  'STRIPE_ALLOW_LIVE',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_PLACEMENT_WEEKLY',
  'STRIPE_PRICE_PLACEMENT_MONTHLY',
  'STRIPE_PRICE_NEWSLETTER_SLOT',
] as const

const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  resetStripeCache()
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function env(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    VERCEL_ENV: 'production',
    STRIPE_ALLOW_LIVE: undefined,
    STRIPE_SECRET_KEY: testKey,
    ...overrides,
  }
}

describe('sponsor checkout surface', () => {
  it('is live only when the flag is exactly true and the key is sk_live or rk_live', () => {
    expect(sponsorLiveBilling(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe(true)
    expect(sponsorLiveBilling(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: restrictedLiveKey }))).toBe(true)
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe('live')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'preview', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: restrictedLiveKey }))).toBe('live')

    for (const flag of [undefined, 'false', 'TRUE', 'True', ' true', 'true ', 'yes', '1']) {
      expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: flag, STRIPE_SECRET_KEY: liveKey })), flag).toBe('closed')
    }
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: testKey }))).toBe('closed')
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: '' }))).toBe('closed')
  })

  it('keeps test checkout off production and on every other environment', () => {
    for (const vercelEnv of ['preview', 'development', 'test', 'preview-branch', '', undefined]) {
      expect(sponsorCheckoutSurface(env({ VERCEL_ENV: vercelEnv, STRIPE_SECRET_KEY: testKey })), String(vercelEnv)).toBe('test')
    }
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey }))).toBe('closed')
    expect(
      sponsorCheckoutSurface(env({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: testKey, SPONSOR_PUBLIC_CHECKOUT: '1' })),
    ).toBe('closed')
  })
})

describe('production sponsor page', () => {
  function pageHtml(): string {
    resetStripeCache()
    return renderToStaticMarkup(createElement(SponsorPage))
  }

  it('hides the test banner and checkout button and keeps the prices and contact link', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_SECRET_KEY = testKey
    delete process.env.STRIPE_ALLOW_LIVE
    process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_week'
    process.env.STRIPE_PRICE_PLACEMENT_MONTHLY = 'price_month'
    process.env.STRIPE_PRICE_NEWSLETTER_SLOT = 'price_issue'
    const html = pageHtml()
    expect(html).toContain(SPONSOR_OPENING_SOON)
    expect(html).toContain(`href="${SPONSOR_CONTACT_MAILTO}"`)
    expect(html).toContain('Featured placement: $99 for one week.')
    expect(html).toContain('Featured placement: $299 for one month.')
    expect(html).toContain('Newsletter sponsor slot: $49 per issue.')
    expect(html).not.toContain('Stripe test mode')
    expect(html).not.toContain('Continue to checkout')
    expect(html).not.toContain('role="note"')
  })

  it('shows live checkout on production once live billing is on', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_ALLOW_LIVE = allowLive
    process.env.STRIPE_SECRET_KEY = liveKey
    process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_week'
    const html = pageHtml()
    expect(html).toContain('Checkout uses Stripe live mode.')
    expect(html).toContain('Continue to checkout')
    expect(html).not.toContain(SPONSOR_OPENING_SOON)
    expect(html).not.toContain('Stripe test mode')
  })

  it('shows test checkout on preview and development', () => {
    for (const vercelEnv of ['preview', 'development']) {
      process.env.VERCEL_ENV = vercelEnv
      delete process.env.STRIPE_ALLOW_LIVE
      process.env.STRIPE_SECRET_KEY = testKey
      const html = pageHtml()
      expect(html, vercelEnv).toContain('Stripe test mode')
      expect(html, vercelEnv).toContain('Continue to checkout')
      expect(html, vercelEnv).not.toContain(SPONSOR_OPENING_SOON)
    }
  })
})

describe('sponsor checkout refusal', () => {
  it('returns 503 on production and does not create a session from the action', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_SECRET_KEY = testKey
    delete process.env.STRIPE_ALLOW_LIVE
    const response = POST()
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: SPONSOR_OPENING_SOON })

    const action = await sponsorCheckoutAction({ status: 'idle', message: '' }, new FormData())
    expect(action).toEqual({ status: 'error', message: SPONSOR_OPENING_SOON })
  })

  it('does not return 503 once live billing is on or outside production', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_ALLOW_LIVE = allowLive
    process.env.STRIPE_SECRET_KEY = restrictedLiveKey
    expect(POST().status).toBe(404)

    process.env.VERCEL_ENV = 'preview'
    process.env.STRIPE_SECRET_KEY = testKey
    delete process.env.STRIPE_ALLOW_LIVE
    const preview = POST()
    expect(preview.status).toBe(404)
    expect(await preview.json()).toEqual({ error: 'Checkout is not available on this endpoint.' })
  })

  it('checks the gate before Stripe and has no query-string bypass', () => {
    const action = readFileSync(path.join(process.cwd(), 'src/app/sponsor/actions.ts'), 'utf8')
    const page = readFileSync(path.join(process.cwd(), 'src/app/sponsor/page.tsx'), 'utf8')
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/sponsor/checkout/route.ts'), 'utf8')
    expect(action.indexOf('sponsorCheckoutClosed()')).toBeLessThan(action.indexOf('getStripe()'))
    expect(action.indexOf('sponsorCheckoutClosed()')).toBeLessThan(action.indexOf('sessions.create'))
    expect(page).not.toContain('searchParams')
    expect(action).not.toContain('searchParams')
    expect(route).not.toContain('searchParams')
    expect(route).not.toContain('sessions.create')
  })
})
