import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { DealList } from '@/components/deal-card'
import { loadDealViews } from '@/lib/deals'
import { pageMetadata } from '@/lib/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Member deals',
  description: 'Discount codes on AI tools for BestBotFor members.',
  path: '/deals',
})

export default async function DealsPage() {
  const { member, views } = await loadDealViews()
  return (
    <article className="space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Deals', path: '/deals' }]} />
      <h1 className="font-bold text-5xl leading-tight">Member deals</h1>
      <p className="text-lg">
        {member ? 'Your member codes and deal links.' : 'Members get discount codes on AI tools. Codes and links show once you sign in with an active membership.'}
      </p>
      {views.length === 0 ? <p>No deals right now. Check back soon.</p> : <DealList deals={views} />}
    </article>
  )
}
