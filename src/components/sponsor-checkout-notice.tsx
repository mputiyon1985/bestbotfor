import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO, SPONSOR_OPENING_SOON, type SponsorCheckoutSurface } from '@/lib/sponsor-checkout-gate'

/** Production stays on the opening-soon line. Preview and live keep the Stripe mode note. */
export function SponsorCheckoutNotice({ surface }: { surface: SponsorCheckoutSurface }) {
  if (surface === 'closed') {
    return (
      <p>
        {SPONSOR_OPENING_SOON}{' '}
        <a className="inline-flex min-h-11 items-center font-semibold underline" href={SPONSOR_CONTACT_MAILTO}>
          Contact {SPONSOR_CONTACT_EMAIL}
        </a>
      </p>
    )
  }
  return (
    <p role="note" className="rounded-2xl border border-line bg-mist px-4 py-3 text-sm">
      {surface === 'live'
        ? 'Checkout uses Stripe live mode.'
        : 'Checkout uses Stripe test mode. No real charges occur.'}
    </p>
  )
}
