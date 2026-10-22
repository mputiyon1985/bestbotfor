import { stripeKeyMode } from '@/lib/stripe'

export const STRIPE_TEST_MODE_NOTICE = 'Checkout uses Stripe test mode. No real charges occur.'

/**
 * The test-mode note, shown only when the server's Stripe key is a test key.
 * It uses the same detection as /sponsor (`stripeKeyMode`). With a live key, or
 * no usable key, it renders nothing, so a live page never claims test mode.
 */
export function StripeTestModeNotice({ mode = stripeKeyMode() }: { mode?: 'off' | 'test' | 'live' }) {
  if (mode !== 'test') return null
  return (
    <p role="note" className="rounded-2xl border border-line bg-mist px-4 py-3 text-sm">
      {STRIPE_TEST_MODE_NOTICE}
    </p>
  )
}
