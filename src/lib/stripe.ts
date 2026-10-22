import 'server-only'

import Stripe from 'stripe'
import {
  STRIPE_API_VERSION,
  isLiveSecretKey,
  isTestSecretKey,
  secretKeyAllowed,
} from './stripe-key'
import { membershipConfigured } from './membership-plans'

export { isTestSecretKey, STRIPE_API_VERSION } from './stripe-key'

let cached: Stripe | null | undefined

function loopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost'
}

/**
 * Test keys may point at a loopback Stripe stand-in for end-to-end tests.
 * Live keys always use Stripe's own host.
 */
function clientOptions(key: string): Stripe.StripeConfig {
  const options: Stripe.StripeConfig = { apiVersion: STRIPE_API_VERSION }
  const host = process.env.STRIPE_API_HOST?.trim() ?? ''
  const port = Number(process.env.STRIPE_API_PORT ?? '')
  if (isTestSecretKey(key) && loopbackHost(host) && Number.isInteger(port) && port > 0 && port < 65_536) {
    options.host = host
    options.port = port
    options.protocol = 'http'
  }
  return options
}

export function isStripeConfigured(): boolean {
  if (!getStripe()) return false
  const webhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ''
  const price = process.env.STRIPE_PRICE_ID?.trim() ?? ''
  return webhook.length > 0 && (price.startsWith('price_') || membershipConfigured())
}

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  if (!secretKeyAllowed(key)) {
    cached = null
    return null
  }
  cached = new Stripe(key, clientOptions(key))
  return cached
}

export function resetStripeCache(): void {
  cached = undefined
}

export function stripeKeyMode(): 'off' | 'test' | 'live' {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  if (!secretKeyAllowed(key)) return 'off'
  return isLiveSecretKey(key) ? 'live' : 'test'
}

export function stripePriceId(): string | null {
  if (!isStripeConfigured()) return null
  return process.env.STRIPE_PRICE_ID?.trim() ?? null
}

export function stripeWebhookSecret(): string | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ''
  if (!secret || !getStripe()) return null
  return secret
}
