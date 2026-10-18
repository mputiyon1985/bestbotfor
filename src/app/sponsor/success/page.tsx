import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { SponsorCardFollowup } from '@/components/sponsor-card-followup'
import { pageMetadata } from '@/lib/metadata'

const CHECKOUT_SESSION = /^cs_[A-Za-z0-9_]{8,200}$/

export const metadata: Metadata = pageMetadata({
  title: 'Sponsor checkout',
  description: 'Stripe will confirm the sponsorship. This page does not record the payment.',
  path: '/sponsor/success',
  noIndex: true,
})

export default async function SponsorSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>
}) {
  const query = await searchParams
  const raw = Array.isArray(query.session_id) ? query.session_id[0] : query.session_id
  const sessionId = raw && CHECKOUT_SESSION.test(raw) ? raw : null
  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Sponsor', path: '/sponsor' }, { name: 'Success', path: '/sponsor/success' }]} />
      <h1 className="font-bold text-5xl">Checkout received</h1>
      <p>
        Thanks. If the payment completes, Stripe notifies this site and the sponsorship is recorded from that webhook.
        You can close this page. No card details are stored here.
      </p>
      {sessionId ? <SponsorCardFollowup sessionId={sessionId} /> : null}
      <p>
        <Link href="/sponsor" className="font-semibold underline-offset-4 hover:underline">
          Back to sponsor slots
        </Link>
      </p>
    </article>
  )
}
