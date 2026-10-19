import type { Metadata } from 'next'
import { taskSeeds } from '@/data/catalog'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SponsorCheckoutNotice } from '@/components/sponsor-checkout-notice'
import { SponsorForm } from '@/components/sponsor-form'
import { SponsorPaymentLinks } from '@/components/sponsor-payment-links'
import { SPONSOR_PAYMENT_LINKS_NOTE } from '@/lib/sponsor-payment-links'
import { pageMetadata } from '@/lib/metadata'
import { foundingSoldOutNow } from '@/lib/sponsor-availability'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO, sponsorCheckoutSurface } from '@/lib/sponsor-checkout-gate'
import {
  FOUNDING_SPONSOR_CAP,
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_SOLD_OUT_LABEL,
  SPONSOR_OFFERINGS,
  SPONSOR_ONE_TIME_NOTICE,
  SPONSOR_SUBSCRIPTION_NOTICE,
  sponsorOffering,
  sponsorOfferingConfigured,
  sponsorOfferingNotice,
  sponsorOfferingPriceLabel,
  sponsorPriceLabel,
} from '@/lib/sponsor-offerings'
import { stripeKeyMode } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

const SPONSOR_META_OFFER = 'Sponsor a featured tool slot on a BestBotFor guide, or a slot in the newsletter.'

export function generateMetadata(): Metadata {
  const surface = sponsorCheckoutSurface()
  const description = surface === 'closed' ? SPONSOR_META_OFFER : `${SPONSOR_META_OFFER} Checkout is Stripe’s hosted page.`
  return pageMetadata({
    title: 'Sponsor',
    description,
    path: '/sponsor',
  })
}

export default async function SponsorPage() {
  const surface = sponsorCheckoutSurface()
  const mode = stripeKeyMode()
  // The founding offer is in-app only. Its Payment Link was retired from the
  // code after the 2026-10-19 go-live (it is inactive in Stripe).
  const inAppFounding = sponsorOfferingConfigured('founding_sponsor')
  // Sold out: the shared founding count (paid unrefunded founding rows, founding
  // link first-period rows, and live founding checkout holds) has reached the cap.
  // The database is read only when the founding offer could otherwise be bought.
  const foundingSoldOut = surface !== 'closed' && mode !== 'off' && inAppFounding ? await foundingSoldOutNow() : false
  const offerings = SPONSOR_OFFERINGS.map((offering) => {
    const soldOut = offering.id === 'founding_sponsor' && foundingSoldOut
    const available = surface !== 'closed' && mode !== 'off' && sponsorOfferingConfigured(offering.id) && !soldOut
    // A disabled option is sent without its price or terms, so the form cannot show them.
    return {
      id: offering.id,
      title: offering.title,
      summary: available ? offering.summary : '',
      priceLabel: available ? sponsorOfferingPriceLabel(offering) : '',
      notice: available ? sponsorOfferingNotice(offering) : '',
      target: offering.target,
      available,
      soldOut,
    }
  })
  const tasks = taskSeeds.map((task) => ({ slug: task.slug, name: task.name }))
  const week = sponsorPriceLabel(SPONSOR_OFFERINGS[0].unitAmount)
  const month = sponsorPriceLabel(SPONSOR_OFFERINGS[1].unitAmount)
  const issue = sponsorPriceLabel(SPONSOR_OFFERINGS[2].unitAmount)
  const subscriptionOffering = sponsorOffering('placement_subscription')
  const foundingOffering = sponsorOffering('founding_sponsor')
  const subscription = subscriptionOffering ? sponsorOfferingPriceLabel(subscriptionOffering) : ''
  const founding = foundingOffering ? sponsorOfferingPriceLabel(foundingOffering) : ''
  // The price list names a subscription offer only once its Prices are set, the
  // same check that enables its radio, so the list never offers a disabled option.
  const listSubscription = Boolean(subscriptionOffering) && sponsorOfferingConfigured('placement_subscription')
  // The founding line is listed only where the offer can be bought (checkout
  // open with a usable key), the same place its sold-out count is read. A closed
  // or keyless page at 5/5 would otherwise list a founding price and "Limited to
  // 5" for spots that are gone.
  const listFounding = Boolean(foundingOffering) && inAppFounding && surface !== 'closed' && mode !== 'off'
  // "one-time and subscription" only while a subscription price is listed. A
  // sold-out founding line carries no price.
  const listsSubscriptionPrice = listSubscription || (listFounding && !foundingSoldOut)

  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Sponsor', path: '/sponsor' }]} />
      <h1 className="font-bold text-5xl">Sponsor</h1>
      <SponsorCheckoutNotice surface={surface} />
      <p>
        Buy a featured tool slot on one /best/[task] page, or a sponsor mention in one newsletter issue.
        {surface === 'closed' ? null : ' Payment happens on Stripe’s hosted checkout page. This site does not collect card numbers.'}
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Featured placement: {week} for one week. {SPONSOR_ONE_TIME_NOTICE}
        </li>
        <li>
          Featured placement: {month} for one month. {SPONSOR_ONE_TIME_NOTICE}
        </li>
        <li>
          Newsletter sponsor slot: {issue} per issue. {SPONSOR_ONE_TIME_NOTICE}
        </li>
        {listSubscription ? (
          <li>
            Featured placement, monthly subscription: {subscription}. {SPONSOR_SUBSCRIPTION_NOTICE}
          </li>
        ) : null}
        {listFounding && foundingSoldOut ? (
          <li>
            Founding sponsor: {SPONSOR_SOLD_OUT_LABEL}. All {FOUNDING_SPONSOR_CAP} founding sponsor spots are taken.
          </li>
        ) : null}
        {listFounding && !foundingSoldOut ? (
          <li>
            Founding sponsor: {founding}. {SPONSOR_FOUNDING_NOTICE} Limited to {FOUNDING_SPONSOR_CAP} founding sponsors.
          </li>
        ) : null}
      </ul>
      <p className="text-sm text-muted">
        {listsSubscriptionPrice
          ? 'The prices above, one-time and subscription, are the current list prices from server configuration.'
          : 'The prices above are the current list prices from server configuration.'}{' '}
        They can be changed there.
        {surface === 'live' ? ` ${SPONSOR_PAYMENT_LINKS_NOTE}` : null}
        {surface === 'closed' ? null : ' The form does not send an amount. Checkout charges the Stripe price configured on the server.'}
      </p>
      {surface === 'live' ? <SponsorPaymentLinks /> : null}
      {surface === 'live' ? (
        <p>
          Questions or custom deals?{' '}
          <a className="inline-flex min-h-11 items-center font-semibold underline" href={SPONSOR_CONTACT_MAILTO}>
            {SPONSOR_CONTACT_EMAIL}
          </a>
        </p>
      ) : null}
      {surface === 'closed' ? null : <SponsorForm offerings={offerings} tasks={tasks} />}
    </article>
  )
}
