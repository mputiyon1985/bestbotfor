import Link from 'next/link'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO } from '@/lib/sponsor-checkout-gate'
import {
  SPONSOR_CANCEL_LINE,
  SPONSOR_PAYMENT_LINKS,
  SPONSOR_SUBSCRIPTION_DISCLOSURE,
  SPONSOR_SUBSCRIPTION_NOTICE,
} from '@/lib/sponsor-payment-links'

/**
 * Live-only sponsor Payment Links. Each button opens Stripe's hosted page.
 * The renewal notice and the cancel line are the Monthly subscription only.
 * Featured week and the newsletter mention are one-time and do not renew.
 * The founding offer is in-app (see src/lib/sponsor-payment-links.ts).
 */
export function SponsorPaymentLinks() {
  return (
    <section aria-labelledby="sponsor-payment-links" className="space-y-3">
      <h2 id="sponsor-payment-links" className="font-bold text-2xl">
        Payment Links
      </h2>
      <p className="text-sm text-muted">
        {SPONSOR_SUBSCRIPTION_DISCLOSURE}{' '}
        <Link href="/disclosure" className="underline">
          Disclosures
        </Link>
        .
      </p>
      <ul className="space-y-3">
        {SPONSOR_PAYMENT_LINKS.map((link) => (
          <li key={link.id} className="rounded-2xl border border-line px-4 py-3">
            <p className="font-semibold">{link.title}</p>
            <p>{link.terms}</p>
            <p>
              {link.id === 'newsletter_mention'
                ? 'Stripe asks for the tool name, and we email you to set up the mention.'
                : 'Stripe asks which /best page you want to sponsor, and we email you to set up the placement.'}
            </p>
            {link.billing === 'subscription' ? <p>{SPONSOR_SUBSCRIPTION_NOTICE}</p> : null}
            <a className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href={link.url} rel="noopener">
              {link.cta}
            </a>
            {link.billing === 'subscription' ? (
              <p>
                {SPONSOR_CANCEL_LINE}{' '}
                <a className="inline-flex min-h-11 items-center font-semibold underline" href={SPONSOR_CONTACT_MAILTO}>
                  {SPONSOR_CONTACT_EMAIL}
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
