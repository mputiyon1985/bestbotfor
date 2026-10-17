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
}

afterEach(() => {
  resetStripeCache()
  for (const [name, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('stripe key policy', () => {
  it('refuses a live secret key unless the flag is exactly true', () => {
    expect(secretKeyAllowed(liveKey, {})).toBe(false)
    expect(secretKeyAllowed(liveKey, { STRIPE_ALLOW_LIVE: 'false' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { STRIPE_ALLOW_LIVE: 'TRUE' })).toBe(false)
    expect(secretKeyAllowed(liveKey, { STRIPE_ALLOW_LIVE: 'true' })).toBe(true)
    expect(isTestSecretKey(liveKey)).toBe(false)
    expect(secretKeyAllowed(testKey, {})).toBe(true)
  })

  it('refuses live keys in getStripe until the flag is on', () => {
    process.env.STRIPE_SECRET_KEY = liveKey
    delete process.env.STRIPE_ALLOW_LIVE
    expect(getStripe()).toBeNull()
    expect(stripeKeyMode()).toBe('off')

    process.env.STRIPE_ALLOW_LIVE = 'false'
    resetStripeCache()
    expect(getStripe()).toBeNull()

    process.env.STRIPE_ALLOW_LIVE = ['tr', 'ue'].join('')
    resetStripeCache()
    expect(getStripe()).not.toBeNull()
    expect(stripeKeyMode()).toBe('live')
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
