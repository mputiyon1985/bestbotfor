import { SPONSOR_PAYMENT_LINKS, SPONSOR_SUBSCRIPTION_NOTICE } from '@/lib/sponsor-payment-links'

/** Live-only sponsor subscriptions. Each button opens Stripe's hosted Payment Link. */
export function SponsorPaymentLinks() {
  return (
    <section aria-labelledby="sponsor-subscriptions" className="space-y-3">
      <h2 id="sponsor-subscriptions" className="font-bold text-2xl">
        Sponsor subscriptions
      </h2>
      <p className="text-sm text-muted">
        {SPONSOR_SUBSCRIPTION_NOTICE} Stripe asks which /best page you want to sponsor, and we email you to set up the
        placement.
      </p>
      <ul className="space-y-3">
        {SPONSOR_PAYMENT_LINKS.map((link) => (
          <li key={link.id} className="rounded-2xl border border-line px-4 py-3">
            <p className="font-semibold">{link.title}</p>
            <p>{link.terms}</p>
            <a
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
              href={link.url}
              rel="noopener"
            >
              {link.cta}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
