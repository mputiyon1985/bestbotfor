import type { Metadata } from 'next'
import { taskSeeds } from '@/data/catalog'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SponsorForm } from '@/components/sponsor-form'
import { pageMetadata } from '@/lib/metadata'
import { SPONSOR_OFFERINGS, SPONSOR_ONE_TIME_NOTICE, sponsorPriceId, sponsorPriceLabel } from '@/lib/sponsor-offerings'
import { stripeKeyMode } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Sponsor',
  description: 'Sponsor a featured tool slot on a BestBotFor guide, or a slot in the newsletter. Checkout is Stripe’s hosted page.',
  path: '/sponsor',
})

export default function SponsorPage() {
  const mode = stripeKeyMode()
  const offerings = SPONSOR_OFFERINGS.map((offering) => ({
    id: offering.id,
    title: offering.title,
    summary: offering.summary,
    priceLabel: sponsorPriceLabel(offering.unitAmount),
    target: offering.target,
    available: mode !== 'off' && sponsorPriceId(offering.id) !== null,
  }))
  const tasks = taskSeeds.map((task) => ({ slug: task.slug, name: task.name }))
  const week = sponsorPriceLabel(SPONSOR_OFFERINGS[0].unitAmount)
  const month = sponsorPriceLabel(SPONSOR_OFFERINGS[1].unitAmount)
  const issue = sponsorPriceLabel(SPONSOR_OFFERINGS[2].unitAmount)

  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Sponsor', path: '/sponsor' }]} />
      <h1 className="font-bold text-5xl">Sponsor</h1>
      <p role="note" className="rounded-2xl border border-line bg-mist px-4 py-3 text-sm">
        {mode === 'live'
          ? 'Checkout uses Stripe live mode.'
          : 'Checkout uses Stripe test mode. No real charges occur.'}
      </p>
      <p>
        Buy a featured tool slot on one /best/[task] page, or a sponsor mention in one newsletter issue. Payment happens
        on Stripe’s hosted checkout page. This site does not collect card numbers.
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
      </ul>
      <p className="text-sm text-muted">
        These are the current list prices from server configuration. They can be changed there. The form does not send
        an amount. Checkout charges the Stripe price configured on the server.
      </p>
      <SponsorForm offerings={offerings} tasks={tasks} />
    </article>
  )
}
