import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { STRIPE_TEST_MODE_NOTICE, StripeTestModeNotice } from '@/components/stripe-test-mode-notice'
import { resetStripeCache, stripeKeyMode } from './stripe'

const testKey = ['sk', 'test', 'example'].join('_')
const liveKey = ['sk', 'live', 'example'].join('_')
const allowLive = ['tr', 'ue'].join('')
const KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_ALLOW_LIVE', 'VERCEL_ENV'] as const
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetStripeCache()
}

const notice = () => renderToStaticMarkup(createElement(StripeTestModeNotice))

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetStripeCache()
})

describe('/pricing Stripe mode notice', () => {
  it('test mode: shows the test-mode note', () => {
    setEnv({ STRIPE_SECRET_KEY: testKey, VERCEL_ENV: 'preview' })
    expect(stripeKeyMode()).toBe('test')
    expect(notice()).toBe(`<p role="note" class="rounded-2xl border border-line bg-mist px-4 py-3 text-sm">${STRIPE_TEST_MODE_NOTICE}</p>`)
  })

  it('live mode: shows nothing, so the live page never claims test mode', () => {
    setEnv({ STRIPE_SECRET_KEY: liveKey, STRIPE_ALLOW_LIVE: allowLive, VERCEL_ENV: 'production' })
    expect(stripeKeyMode()).toBe('live')
    expect(notice()).toBe('')
  })

  it('no usable key (unset, or a live key without the live flag): shows nothing', () => {
    setEnv({})
    expect(stripeKeyMode()).toBe('off')
    expect(notice()).toBe('')
    setEnv({ STRIPE_SECRET_KEY: liveKey, VERCEL_ENV: 'production' })
    expect(stripeKeyMode()).toBe('off')
    expect(notice()).toBe('')
  })

  it('the pricing page uses the mode-aware notice and no hardcoded test-mode line; membership pricing is untouched', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf8')
    expect(page).toContain('<StripeTestModeNotice />')
    expect(page).not.toContain('Stripe test mode')
    expect(page).toContain('const price = await getPublicPrice()')
  })
})
