import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Sponsor checkout',
  description: 'Stripe will confirm the sponsorship. This page does not record the payment.',
  path: '/sponsor/success',
  noIndex: true,
})

export default function SponsorSuccessPage() {
  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Sponsor', path: '/sponsor' }, { name: 'Success', path: '/sponsor/success' }]} />
      <h1 className="font-bold text-5xl">Checkout received</h1>
      <p>
        Thanks. If the payment completes, Stripe notifies this site and the sponsorship is recorded from that webhook.
        You can close this page. No card details are stored here.
      </p>
      <p>
        <Link href="/sponsor" className="font-semibold underline-offset-4 hover:underline">
          Back to sponsor slots
        </Link>
      </p>
    </article>
  )
}
