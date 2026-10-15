import 'server-only'

import Stripe from 'stripe'

const LIVE_MARKERS = ['sk_', 'rk_', 'pk_'].map((prefix) => prefix + 'live_')

/** Test-mode secret keys only. Live and restricted keys are refused. */
export function isTestSecretKey(key: string): boolean {
  if (!key.startsWith('sk_' + 'test_')) return false
  return !LIVE_MARKERS.some((marker) => key.includes(marker))
}

export function isStripeConfigured(): boolean {
  return getStripe() !== null
}

let cached: Stripe | null | undefined

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  const webhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ''
  const price = process.env.STRIPE_PRICE_ID?.trim() ?? ''
  if (!key || !webhook || !price || !isTestSecretKey(key) || !price.startsWith('price_')) {
    cached = null
    return null
  }
  cached = new Stripe(key)
  return cached
}

export function resetStripeCache(): void {
  cached = undefined
}

export function stripePriceId(): string | null {
  if (!getStripe()) return null
  return process.env.STRIPE_PRICE_ID?.trim() ?? null
}

export function stripeWebhookSecret(): string | null {
  if (!getStripe()) return null
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? null
}
