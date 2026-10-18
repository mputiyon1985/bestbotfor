import type { Metadata } from 'next'
import { taskSeeds } from '@/data/catalog'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SponsorCheckoutNotice } from '@/components/sponsor-checkout-notice'
import { SponsorForm } from '@/components/sponsor-form'
import { pageMetadata } from '@/lib/metadata'
import { sponsorCheckoutSurface } from '@/lib/sponsor-checkout-gate'
import {
  FOUNDING_SPONSOR_CAP,
  SPONSOR_FOUNDING_NOTICE,
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

export default function SponsorPage() {
  const surface = sponsorCheckoutSurface()
  const mode = stripeKeyMode()
  const offerings = SPONSOR_OFFERINGS.map((offering) => ({
    id: offering.id,
    title: offering.title,
    summary: offering.summary,
    priceLabel: sponsorOfferingPriceLabel(offering),
    notice: sponsorOfferingNotice(offering),
    target: offering.target,
    available: surface !== 'closed' && mode !== 'off' && sponsorOfferingConfigured(offering.id),
  }))
  const tasks = taskSeeds.map((task) => ({ slug: task.slug, name: task.name }))
  const week = sponsorPriceLabel(SPONSOR_OFFERINGS[0].unitAmount)
  const month = sponsorPriceLabel(SPONSOR_OFFERINGS[1].unitAmount)
  const issue = sponsorPriceLabel(SPONSOR_OFFERINGS[2].unitAmount)
  const subscriptionOffering = sponsorOffering('placement_subscription')
  const foundingOffering = sponsorOffering('founding_sponsor')
  const subscription = subscriptionOffering ? sponsorOfferingPriceLabel(subscriptionOffering) : ''
  const founding = foundingOffering ? sponsorOfferingPriceLabel(foundingOffering) : ''

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
        <li>
          Featured placement, monthly subscription: {subscription}. {SPONSOR_SUBSCRIPTION_NOTICE}
        </li>
        <li>
          Founding sponsor: {founding}. {SPONSOR_FOUNDING_NOTICE} Limited to {FOUNDING_SPONSOR_CAP} founding sponsors.
        </li>
      </ul>
      <p className="text-sm text-muted">
        These are the current list prices from server configuration. They can be changed there.
        {surface === 'closed' ? null : ' The form does not send an amount. Checkout charges the Stripe price configured on the server.'}
      </p>
      {surface === 'closed' ? null : <SponsorForm offerings={offerings} tasks={tasks} />}
    </article>
  )
}
