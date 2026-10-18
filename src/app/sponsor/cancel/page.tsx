import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Sponsor checkout canceled',
  description: 'Sponsor checkout was canceled. No charge was made.',
  path: '/sponsor/cancel',
  noIndex: true,
})

export default function SponsorCancelPage() {
  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Sponsor', path: '/sponsor' }, { name: 'Canceled', path: '/sponsor/cancel' }]} />
      <h1 className="font-bold text-5xl">Checkout canceled</h1>
      <p>Checkout was canceled. You have not been charged.</p>
      <p>
        <Link href="/sponsor" className="font-semibold underline-offset-4 hover:underline">
          Return to sponsor slots
        </Link>
      </p>
    </article>
  )
}
