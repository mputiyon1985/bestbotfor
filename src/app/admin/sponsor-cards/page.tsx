import Link from 'next/link'
import { SponsorCardQueue } from '@/components/sponsor-card-queue'
import { requireAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { listPendingSponsorCards } from '@/lib/sponsor-card'
import { listSponsorPlacementCounts, type SponsorPlacementCount } from '@/lib/sponsor-impressions'

export const dynamic = 'force-dynamic'

export default async function SponsorCardsPage() {
  await requireAdmin()
  const db = getDb()
  const cards = await listPendingSponsorCards(db)
  let counts: SponsorPlacementCount[] = []
  let countsUnavailable = false
  try {
    counts = await listSponsorPlacementCounts(db)
  } catch (error) {
    console.error('sponsor count lookup failed', error instanceof Error ? error.name : 'error')
    countsUnavailable = true
  }
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
      <h2 className="font-semibold text-3xl">Placement counts</h2>
      <p>Daily impressions are approved card renders. /go clicks are Visit redirects from that /best page. Both are totals for the UTC day.</p>
      {countsUnavailable ? <p>Counts are unavailable.</p> : null}
      {!countsUnavailable && counts.length === 0 ? <p>No approved placements yet.</p> : null}
      {counts.map((placement) => (
        <section key={placement.sponsorshipId} className="space-y-2">
          <h3 className="font-semibold">
            {placement.toolName}
            {placement.taskSlug ? ` · /best/${placement.taskSlug}` : ''}
            {placement.company ? ` · ${placement.company}` : ''}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Daily impressions and /go clicks for {placement.toolName}</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">Day</th>
                  <th scope="col" className="py-2 pr-3">Impressions</th>
                  <th scope="col" className="py-2">/go clicks</th>
                </tr>
              </thead>
              <tbody>
                {placement.days.length === 0 ? (
                  <tr className="border-b border-line">
                    <td className="py-2" colSpan={3}>No counts yet.</td>
                  </tr>
                ) : (
                  placement.days.map((day) => (
                    <tr key={day.day} className="border-b border-line">
                      <th scope="row" className="py-2 pr-3 font-normal">{day.day}</th>
                      <td className="py-2 pr-3">{day.impressions}</td>
                      <td className="py-2">{day.goClicks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  )
}
