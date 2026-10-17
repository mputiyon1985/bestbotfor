import Link from 'next/link'
import { SponsorCardQueue, SponsorRefundQueue } from '@/components/sponsor-card-queue'
import { requireAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { listPendingSponsorCards, listRefundPendingSponsorCards } from '@/lib/sponsor-card'

export const dynamic = 'force-dynamic'

export default async function SponsorCardsPage() {
  await requireAdmin()
  const db = getDb()
  const cards = await listPendingSponsorCards(db)
  const refunds = await listRefundPendingSponsorCards(db)
  return (
    <article className="max-w-2xl space-y-6">
      <p>
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="font-bold text-5xl">Sponsor tool cards</h1>
      <p>Nothing is public until you approve the name, logo, text, and URL of the version you are looking at.</p>
      {cards.length === 0 ? <p>No tool cards are waiting for review.</p> : <SponsorCardQueue cards={cards} />}
      <h2 className="font-bold text-3xl">Refunds</h2>
      <p>Refund the payment in the Stripe dashboard, then mark the card refunded. A partial refund still hides the placement.</p>
      {refunds.length === 0 ? <p>No cards are waiting for a refund.</p> : <SponsorRefundQueue cards={refunds} />}
    </article>
  )
}
