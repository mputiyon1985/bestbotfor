import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SponsorCardQueue, SponsorRefundQueue } from '@/components/sponsor-card-queue'
import { adminHomePath, requireAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { adminSponsorsEnabled } from '@/lib/flags'
import { foundingFoundersOverCap, type PaidFounder } from '@/lib/sponsor-availability'
import { listPendingSponsorCards, listRefundPendingSponsorCards } from '@/lib/sponsor-card'
import { listSponsorPlacementCounts, type SponsorPlacementCount } from '@/lib/sponsor-impressions'
import { abandonedOfferLabel, listAbandonedSponsorCheckouts } from '@/lib/sponsor-abandoned'
import { listPlacementOverlaps, type PlacementOverlap } from '@/lib/sponsor-overlap'
import { listPassedNewsletterIssues, type PassedNewsletterIssue } from '@/lib/newsletter-issue'

export const dynamic = 'force-dynamic'

export default async function SponsorCardsPage() {
  if (!adminSponsorsEnabled()) notFound()
  await requireAdmin()
  const db = getDb()
  const cards = await listPendingSponsorCards(db)
  const refunds = await listRefundPendingSponsorCards(db)
  let overCap: PaidFounder[] = []
  let overCapUnavailable = false
  try {
    overCap = await foundingFoundersOverCap(db)
  } catch (error) {
    console.error('founding cap lookup failed', error instanceof Error ? error.name : 'error')
    overCapUnavailable = true
  }
  let counts: SponsorPlacementCount[] = []
  let countsUnavailable = false
  let abandoned: Awaited<ReturnType<typeof listAbandonedSponsorCheckouts>> = []
  let abandonedUnavailable = false
  let overlaps: PlacementOverlap[] = []
  let overlapsUnavailable = false
  let passedIssues: PassedNewsletterIssue[] = []
  let passedIssuesUnavailable = false
  try {
    counts = await listSponsorPlacementCounts(db)
  } catch (error) {
    console.error('sponsor count lookup failed', error instanceof Error ? error.name : 'error')
    countsUnavailable = true
  }
  try {
    abandoned = await listAbandonedSponsorCheckouts(db)
  } catch (error) {
    console.error('abandoned sponsor checkout lookup failed', error instanceof Error ? error.name : 'error')
    abandonedUnavailable = true
  }
  try {
    overlaps = await listPlacementOverlaps(db)
  } catch (error) {
    console.error('placement overlap lookup failed', error instanceof Error ? error.name : 'error')
    overlapsUnavailable = true
  }
  try {
    passedIssues = await listPassedNewsletterIssues(db)
  } catch (error) {
    console.error('newsletter issue lookup failed', error instanceof Error ? error.name : 'error')
    passedIssuesUnavailable = true
  }
  return (
    <article className="max-w-2xl space-y-6">
      {adminHomePath() === '/admin' ? (
        <p>
          <Link href="/admin" className="underline">
            Admin
          </Link>
        </p>
      ) : null}
      <h1 className="font-bold text-5xl">Sponsor tool cards</h1>
      <p>Nothing is public until you approve the name, logo, text, and URL of the version you are looking at.</p>
      {overCapUnavailable ? <p role="alert">The founding cap check is unavailable.</p> : null}
      {overCap.length > 0 ? (
        <section role="alert" className="space-y-2 border border-danger p-3">
          <h2 className="font-bold text-3xl">Founding cap exceeded</h2>
          <p>
            More than 5 founding sponsors have paid. These founders paid after the first 5. Nothing was refunded
            automatically: Mark decides to refund or honor each one. Do not approve their tool cards until he does.
          </p>
          <ul className="list-disc pl-5">
            {overCap.map((founder) => (
              <li key={founder.id}>
                {founder.company ?? 'No company'}
                {founder.taskSlug ? ` · /best/${founder.taskSlug}` : ''}
                {` · ${founder.sessionId}`}
                {` · paid ${new Date(founder.paidAt).toISOString()}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {cards.length === 0 ? <p>No tool cards are waiting for review.</p> : <SponsorCardQueue cards={cards} />}
      <h2 className="font-bold text-3xl">Refunds</h2>
      <p>Refund the payment in the Stripe dashboard, then mark the card refunded. A partial refund still hides the placement.</p>
      {refunds.length === 0 ? <p>No cards are waiting for a refund.</p> : <SponsorRefundQueue cards={refunds} />}
      {overlapsUnavailable ? <p role="alert">The placement overlap check is unavailable.</p> : null}
      {overlaps.length > 0 ? (
        <section role="alert" className="space-y-2 border border-danger p-3">
          <h2 className="font-bold text-3xl">Placement already taken</h2>
          <p>
            A paid checkout landed on a page that already had an active placement. Nothing was refunded automatically:
            Mark decides to refund or honor each one.
          </p>
          <ul className="list-disc pl-5">
            {overlaps.map((overlap) => (
              <li key={overlap.taskSlug}>
                {`/best/${overlap.taskSlug}`}
                {` · ${overlap.sessionIds.join(', ')}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {passedIssuesUnavailable ? <p role="alert">The newsletter issue check is unavailable.</p> : null}
      {passedIssues.length > 0 ? (
        <section role="alert" className="space-y-2 border border-danger p-3">
          <h2 className="font-bold text-3xl">Newsletter issue already passed</h2>
          <p>
            A newsletter checkout was paid after its issue date. Nothing was refunded automatically: Mark decides to
            refund or honor each one.
          </p>
          <ul className="list-disc pl-5">
            {passedIssues.map((issue) => (
              <li key={issue.sessionId}>
                {issue.issueDate}
                {` · ${issue.sessionId}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <h2 className="font-semibold text-3xl">Abandoned checkouts</h2>
      <p>
        Unpaid sponsor and membership checkouts that expired after the buyer opted in to promotional email. The email, the offer, and the time. When recovery mail is configured, one email is sent for each session. One manual follow-up email is allowed when that send did not happen. Anyone who did not opt in is not listed and gets no follow-up email.
      </p>
      {abandonedUnavailable ? <p role="alert">Abandoned checkouts are unavailable.</p> : null}
      {!abandonedUnavailable && abandoned.length === 0 ? <p>No abandoned sponsor checkouts.</p> : null}
      {abandoned.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Abandoned sponsor checkouts</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">When</th>
                <th scope="col" className="py-2 pr-3">Email</th>
                <th scope="col" className="py-2 pr-3">Offer</th>
                <th scope="col" className="py-2 pr-3">Page</th>
                <th scope="col" className="py-2">Session</th>
              </tr>
            </thead>
            <tbody>
              {abandoned.map((lead) => (
                <tr key={lead.stripeCheckoutSessionId} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">{new Date(lead.expiredAt).toISOString()}</th>
                  <td className="py-2 pr-3">{lead.email}</td>
                  <td className="py-2 pr-3">
                    {abandonedOfferLabel(lead.offering)}
                    {lead.source === 'payment_link' ? ' · Payment Link' : ''}
                  </td>
                  <td className="py-2 pr-3">{lead.taskSlug ? `/best/${lead.taskSlug}` : ''}</td>
                  <td className="py-2">
                    <span className="break-all">{lead.stripeCheckoutSessionId}</span>
                    {lead.recoveryUrl ? (
                      <>
                        {' '}
                        <a className="underline" href={lead.recoveryUrl} rel="noopener noreferrer">
                          Recovery checkout
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <h2 className="font-semibold text-3xl">Placement counts</h2>
      <p>Daily impressions are approved card renders. Card clicks are visits through the Sponsored card. Both are totals for the UTC day.</p>
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
              <caption className="sr-only">Daily impressions and card clicks for {placement.toolName}</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">Day</th>
                  <th scope="col" className="py-2 pr-3">Impressions</th>
                  <th scope="col" className="py-2">Card clicks</th>
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
