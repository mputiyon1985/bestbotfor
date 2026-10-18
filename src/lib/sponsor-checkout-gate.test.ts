import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/sponsor/checkout/route'
import { sponsorCheckoutAction } from '@/app/sponsor/actions'
import SponsorPage, { generateMetadata } from '@/app/sponsor/page'
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
const ORIGINAL_NODE_ENV = process.env.NODE_ENV

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string }
  if (value === undefined) delete env.NODE_ENV
  else env.NODE_ENV = value
}

afterEach(() => {
  resetStripeCache()
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  setNodeEnv(ORIGINAL_NODE_ENV)
})

function env(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    VERCEL_ENV: 'production',
    NODE_ENV: 'production',
    STRIPE_ALLOW_LIVE: undefined,
    STRIPE_SECRET_KEY: testKey,
    ...overrides,
  }
}

describe('sponsor checkout surface', () => {
  it('opens live billing only for exact production with the flag and a live key', () => {
    for (const key of [liveKey, restrictedLiveKey]) {
      expect(sponsorLiveBilling(env({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: key }))).toBe(true)
      expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: key }))).toBe('live')
    }
    const notProduction = [
      'preview',
      'test',
      'development',
      undefined,
      '',
      ' ',
      'Production',
      'PRODUCTION',
      ' production',
      'production ',
      '\tproduction',
      'production\n',
      'prod',
      'production-preview',
    ]
    for (const vercelEnv of notProduction) {
      for (const nodeEnv of ['production', 'development', 'test', undefined]) {
        for (const key of [liveKey, restrictedLiveKey]) {
          const input = env({ VERCEL_ENV: vercelEnv, NODE_ENV: nodeEnv, STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: key })
          const label = JSON.stringify({ vercelEnv, nodeEnv, restricted: key === restrictedLiveKey })
          expect(sponsorLiveBilling(input), label).toBe(false)
          expect(sponsorCheckoutSurface(input), label).toBe('closed')
        }
      }
    }
  })

  it('shows the test surface only with a test-mode key', () => {
    for (const vercelEnv of ['preview', 'development', undefined]) {
      const nodeEnv = vercelEnv === undefined ? 'development' : 'production'
      expect(sponsorCheckoutSurface(env({ VERCEL_ENV: vercelEnv, NODE_ENV: nodeEnv, STRIPE_SECRET_KEY: testKey })), String(vercelEnv)).toBe('test')
      for (const key of [undefined, '', '  ', liveKey, restrictedLiveKey, 'not-a-key']) {
        expect(sponsorCheckoutSurface(env({ VERCEL_ENV: vercelEnv, NODE_ENV: nodeEnv, STRIPE_SECRET_KEY: key })), JSON.stringify({ vercelEnv, key: key === undefined ? 'unset' : key.length })).toBe('closed')
      }
    }
  })

  it('is live only when the flag is exactly true and the key is sk_live or rk_live', () => {
    expect(sponsorLiveBilling(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe(true)
    expect(sponsorLiveBilling(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: restrictedLiveKey }))).toBe(true)
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe('live')

    for (const flag of [undefined, 'false', 'TRUE', 'True', ' true', 'true ', 'yes', '1']) {
      expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: flag, STRIPE_SECRET_KEY: liveKey })), flag).toBe('closed')
    }
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: testKey }))).toBe('closed')
    expect(sponsorCheckoutSurface(env({ STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: '' }))).toBe('closed')
  })

  it('allows test checkout only for exact preview, development, test, or local dev', () => {
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey }))).toBe('test')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'development', STRIPE_SECRET_KEY: testKey }))).toBe('test')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'test', NODE_ENV: 'production', STRIPE_SECRET_KEY: testKey }))).toBe('test')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: undefined, NODE_ENV: 'development', STRIPE_SECRET_KEY: testKey }))).toBe('test')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: undefined, NODE_ENV: 'test', STRIPE_SECRET_KEY: testKey }))).toBe('test')
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: undefined, NODE_ENV: undefined, STRIPE_SECRET_KEY: testKey }))).toBe('test')

    for (const vercelEnv of ['production', 'production ', ' preview', 'development ', 'preview-branch', ' test', 'test ', 'TEST', 'testing', 'staging', '', ' ']) {
      expect(sponsorCheckoutSurface(env({ VERCEL_ENV: vercelEnv, NODE_ENV: 'development', STRIPE_SECRET_KEY: testKey })), JSON.stringify(vercelEnv)).toBe('closed')
    }
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: undefined, NODE_ENV: 'production', STRIPE_SECRET_KEY: testKey }))).toBe('closed')
    expect(
      sponsorCheckoutSurface(env({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: testKey, SPONSOR_PUBLIC_CHECKOUT: '1' })),
    ).toBe('closed')
    expect(sponsorLiveBilling(env({ VERCEL_ENV: 'preview-branch', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe(false)
    expect(sponsorCheckoutSurface(env({ VERCEL_ENV: 'preview-branch', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }))).toBe('closed')
  })
})

const CHECKOUT_META = 'Checkout is Stripe’s hosted page.'

function expectSponsorMetadata(closed: boolean) {
  const metadata = generateMetadata()
  const description = metadata.description
  expect(description).toContain('Sponsor a featured tool slot on a BestBotFor guide, or a slot in the newsletter.')
  expect(metadata.openGraph?.description).toBe(description)
  expect(metadata.twitter && 'description' in metadata.twitter ? metadata.twitter.description : undefined).toBe(description)
  if (closed) expect(description).not.toContain(CHECKOUT_META)
  else expect(description).toContain(CHECKOUT_META)
}

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
    expect(html).toContain('Buy a featured tool slot on one /best/[task] page, or a sponsor mention in one newsletter issue.')
    expect(html).toContain('Featured placement: $99 for one week.')
    expect(html).toContain('Featured placement: $299 for one month.')
    expect(html).toContain('Newsletter sponsor slot: $49 per issue.')
    expect(html).toContain('The prices above, one-time and subscription, are the current list prices from server configuration.')
    expect(html).not.toContain('The Payment Links below')
    expect(html).not.toContain('Payment happens on Stripe’s hosted checkout page.')
    expect(html).not.toContain('This site does not collect card numbers.')
    expect(html).not.toContain('The form does not send an amount.')
    expect(html).not.toContain('Checkout charges the Stripe price configured on the server.')
    expect(html).not.toContain('Stripe test mode')
    expect(html).not.toContain('Continue to checkout')
    expect(html).not.toContain('role="note"')
    expectSponsorMetadata(true)
  })

  it('shows live checkout on production once live billing is on', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_ALLOW_LIVE = allowLive
    process.env.STRIPE_SECRET_KEY = liveKey
    process.env.STRIPE_PRICE_PLACEMENT_WEEKLY = 'price_week'
    const html = pageHtml()
    expect(html).toContain('Checkout uses Stripe live mode.')
    expect(html).toContain('The prices above, one-time and subscription, are the current list prices from server configuration.')
    expect(html).toContain('The Payment Links below are separate Stripe links with their own prices set in Stripe.')
    expect(html).toContain('Continue to checkout')
    expect(html).toContain('Payment happens on Stripe’s hosted checkout page.')
    expect(html).toContain('The form does not send an amount.')
    expect(html).toContain('Checkout charges the Stripe price configured on the server.')
    expect(html).toContain('Featured placement: $99 for one week.')
    expect(html).not.toContain(SPONSOR_OPENING_SOON)
    expect(html).not.toContain('Stripe test mode')
    expectSponsorMetadata(false)
  })

  it('stays closed for unset production, a blank env, a padded production value, and an unknown name', () => {
    const cases = [
      { VERCEL_ENV: undefined, NODE_ENV: 'production' },
      { VERCEL_ENV: '', NODE_ENV: 'development' },
      { VERCEL_ENV: 'production ', NODE_ENV: 'development' },
      { VERCEL_ENV: 'preview-branch', NODE_ENV: 'development' },
      { VERCEL_ENV: ' test', NODE_ENV: 'production' },
      { VERCEL_ENV: '  ', NODE_ENV: 'production' },
    ]
    for (const item of cases) {
      if (item.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = item.VERCEL_ENV
      setNodeEnv(item.NODE_ENV)
      delete process.env.STRIPE_ALLOW_LIVE
      process.env.STRIPE_SECRET_KEY = testKey
      const html = pageHtml()
      expect(html, JSON.stringify(item)).toContain(SPONSOR_OPENING_SOON)
      expect(html, JSON.stringify(item)).not.toContain('Stripe test mode')
      expect(html, JSON.stringify(item)).not.toContain('Continue to checkout')
      expect(html, JSON.stringify(item)).not.toContain('Payment happens on Stripe’s hosted checkout page.')
      expect(html, JSON.stringify(item)).not.toContain('The form does not send an amount.')
      expect(POST().status, JSON.stringify(item)).toBe(503)
      expectSponsorMetadata(true)
    }
  })

  it('keeps the page, metadata, route, and action closed outside exact production with the flag and a live key', async () => {
    for (const vercelEnv of ['preview', 'test', 'development', undefined, 'Production', ' production', 'production ']) {
      if (vercelEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = vercelEnv
      process.env.STRIPE_ALLOW_LIVE = allowLive
      process.env.STRIPE_SECRET_KEY = liveKey
      const html = pageHtml()
      const label = String(vercelEnv)
      expect(html, label).toContain(SPONSOR_OPENING_SOON)
      expect(html, label).not.toContain('Stripe live mode')
      expect(html, label).not.toContain('Stripe test mode')
      expect(html, label).not.toContain('Continue to checkout')
      expectSponsorMetadata(true)
      expect(POST().status, label).toBe(503)
      expect(await sponsorCheckoutAction({ status: 'idle', message: '' }, new FormData()), label).toEqual({ status: 'error', message: SPONSOR_OPENING_SOON })
    }
  })

  it('opens the live page and metadata on exact production with the flag and a live key', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.STRIPE_ALLOW_LIVE = allowLive
    process.env.STRIPE_SECRET_KEY = liveKey
    const html = pageHtml()
    expect(html).toContain('Checkout uses Stripe live mode.')
    expect(html).not.toContain('Stripe test mode')
    expect(html).not.toContain(SPONSOR_OPENING_SOON)
    expectSponsorMetadata(false)
  })

  it('shows test checkout on preview, development, and test', () => {
    for (const vercelEnv of ['preview', 'development', 'test']) {
      process.env.VERCEL_ENV = vercelEnv
      delete process.env.STRIPE_ALLOW_LIVE
      process.env.STRIPE_SECRET_KEY = testKey
      const html = pageHtml()
      expect(html, vercelEnv).toContain('Stripe test mode')
      expect(html, vercelEnv).toContain('Continue to checkout')
      expect(html, vercelEnv).toContain('Payment happens on Stripe’s hosted checkout page.')
      expect(html, vercelEnv).toContain('The form does not send an amount.')
      expect(html, vercelEnv).toContain('Checkout charges the Stripe price configured on the server.')
      expect(html, vercelEnv).toContain('Buy a featured tool slot on one /best/[task] page, or a sponsor mention in one newsletter issue.')
      expect(html, vercelEnv).not.toContain(SPONSOR_OPENING_SOON)
      expectSponsorMetadata(false)
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
