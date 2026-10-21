import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStripe, isStripeConfigured, resetStripeCache, stripeKeyMode } from './stripe'
import { assertTestSetupKey, isTestSecretKey, secretKeyAllowed } from './stripe-key'
import { setupSponsorPrices } from './sponsor-setup'

const liveKey = ['sk', 'live', 'example'].join('_')
const testKey = ['sk', 'test', 'example'].join('_')

const ORIGINAL = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_ALLOW_LIVE: process.env.STRIPE_ALLOW_LIVE,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
  VERCEL_ENV: process.env.VERCEL_ENV,
}

afterEach(() => {
  resetStripeCache()
  for (const [name, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('stripe key policy', () => {
  it('refuses a live secret key unless production and the flag are exact', () => {
    expect(secretKeyAllowed(liveKey, {})).toBe(false)
    expect(secretKeyAllowed(liveKey, { STRIPE_ALLOW_LIVE: 'true' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: 'false' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: 'TRUE' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: ' true' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: 'true ' })).toBe(false)
    for (const vercelEnv of ['preview', 'development', 'test', 'Production', 'PRODUCTION', ' production', 'production ', '', 'preview-branch']) {
      expect(secretKeyAllowed(liveKey, { VERCEL_ENV: vercelEnv, STRIPE_ALLOW_LIVE: 'true' }), JSON.stringify(vercelEnv)).toBe(false)
    }
    expect(secretKeyAllowed(liveKey, { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: 'true' })).toBe(true)
    expect(isTestSecretKey(liveKey)).toBe(false)
    expect(secretKeyAllowed(testKey, {})).toBe(true)
    expect(secretKeyAllowed(testKey, { VERCEL_ENV: 'preview' })).toBe(true)
    expect(secretKeyAllowed(testKey, { VERCEL_ENV: 'production' })).toBe(true)
  })

  it('refuses live keys in getStripe unless VERCEL_ENV is exactly production and the flag is on', () => {
    process.env.STRIPE_SECRET_KEY = liveKey
    delete process.env.STRIPE_ALLOW_LIVE
    delete process.env.VERCEL_ENV
    expect(getStripe()).toBeNull()
    expect(stripeKeyMode()).toBe('off')

    process.env.STRIPE_ALLOW_LIVE = 'false'
    resetStripeCache()
    expect(getStripe()).toBeNull()

    process.env.STRIPE_ALLOW_LIVE = ['tr', 'ue'].join('')
    resetStripeCache()
    expect(getStripe()).toBeNull()
    expect(stripeKeyMode()).toBe('off')

    for (const vercelEnv of ['preview', 'development', 'test', 'Production', 'PRODUCTION', ' production', 'production ', '']) {
      process.env.VERCEL_ENV = vercelEnv
      resetStripeCache()
      expect(getStripe(), JSON.stringify(vercelEnv)).toBeNull()
      expect(stripeKeyMode(), JSON.stringify(vercelEnv)).toBe('off')
    }

    process.env.VERCEL_ENV = 'production'
    resetStripeCache()
    expect(getStripe()).not.toBeNull()
    expect(stripeKeyMode()).toBe('live')

    process.env.STRIPE_SECRET_KEY = testKey
    process.env.VERCEL_ENV = 'preview'
    delete process.env.STRIPE_ALLOW_LIVE
    resetStripeCache()
    expect(getStripe()).not.toBeNull()
    expect(stripeKeyMode()).toBe('test')
  })

  it('sends membership checkout and the billing portal through getStripe before a session', () => {
    const checkout = readFileSync(path.join(process.cwd(), 'src/app/pricing/actions.ts'), 'utf8')
    const portal = readFileSync(path.join(process.cwd(), 'src/app/members/actions.ts'), 'utf8')
    expect(checkout.indexOf('const stripe = getStripe()')).toBeGreaterThan(-1)
    expect(checkout.indexOf('const stripe = getStripe()')).toBeLessThan(checkout.indexOf('membershipConfigured()'))
    expect(checkout.indexOf('membershipConfigured()')).toBeLessThan(checkout.indexOf('sessions.create'))
    expect(checkout).toContain("if (!stripe || !userId || !plan || !membershipConfigured()) redirect('/pricing')")
    expect(portal.indexOf('const stripe = getStripe()')).toBeGreaterThan(-1)
    expect(portal.indexOf('const stripe = getStripe()')).toBeLessThan(portal.indexOf('sessions.create'))
    expect(portal).toContain("if (!stripe || !userId) redirect('/pricing')")

    const sponsor = readFileSync(path.join(process.cwd(), 'src/app/sponsor/actions.ts'), 'utf8')
    const cardAction = sponsor.slice(sponsor.indexOf('export async function submitSponsorCardAction'))
    expect(cardAction.indexOf('const stripe = getStripe()')).toBeGreaterThan(-1)
    expect(cardAction.indexOf('const stripe = getStripe()')).toBeLessThan(cardAction.indexOf('verifyPaidSponsorCheckout'))
    expect(cardAction).toContain("if (!stripe) return { status: 'error', message: 'That checkout session is not a paid placement.' }")
  })

  it('does not turn membership billing on without the membership price', () => {
    process.env.STRIPE_SECRET_KEY = testKey
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_PRICE_ID
    expect(getStripe()).not.toBeNull()
    expect(stripeKeyMode()).toBe('test')
    expect(isStripeConfigured()).toBe(false)
  })

  it('refuses live keys in the price setup script even when the flag is true', async () => {
    const createStripe = vi.fn()
    await expect(
      setupSponsorPrices({
        key: liveKey,
        env: { STRIPE_ALLOW_LIVE: 'true' },
        createStripe,
      }),
    ).rejects.toThrow(/test mode/)
    expect(createStripe).not.toHaveBeenCalled()
    expect(() => assertTestSetupKey(liveKey, { STRIPE_ALLOW_LIVE: 'true' })).toThrow(/test mode/)
    expect(() => assertTestSetupKey(testKey, { STRIPE_ALLOW_LIVE: 'true' })).not.toThrow()
  })
})
