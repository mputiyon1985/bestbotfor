import Link from 'next/link'
import { SponsorCardQueue } from '@/components/sponsor-card-queue'
import { requireAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { listPendingSponsorCards } from '@/lib/sponsor-card'

export const dynamic = 'force-dynamic'

export default async function SponsorCardsPage() {
  await requireAdmin()
  const cards = await listPendingSponsorCards(getDb())
  return (
    <article className="max-w-2xl space-y-6">
      <p>
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="font-bold text-5xl">Sponsor tool cards</h1>
      <p>Nothing is public until you approve the name, logo, text, and URL.</p>
      {cards.length === 0 ? <p>No tool cards are waiting for review.</p> : <SponsorCardQueue cards={cards} />}
    </article>
  )
}
