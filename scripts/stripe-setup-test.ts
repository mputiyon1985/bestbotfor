import Stripe from 'stripe'
import { setupSponsorPrices } from '../src/lib/sponsor-setup'
import { STRIPE_API_VERSION } from '../src/lib/stripe-key'

/**
 * Test-mode sponsor products. These slots are advertising, so they are not
 * eligible for Managed Payments. This script does not set a tax code.
 * Checkout disables managed_payments and leaves automatic_tax unset.
 */

function redact(message: string): string {
  return message
    .replace(/(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/whsec_[A-Za-z0-9]+/g, '[redacted]')
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  const lines = await setupSponsorPrices({
    key,
    env: process.env,
    createStripe: (secret) => new Stripe(secret, { apiVersion: STRIPE_API_VERSION }),
  })
  for (const line of lines) console.log(line)
}

main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : 'Stripe setup failed'))
  process.exit(1)
})
