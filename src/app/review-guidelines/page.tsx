import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { userRatingsEnabled } from '@/lib/flags'
import { policyPageMetadata } from '@/lib/metadata'
import { GUIDELINES_PARAGRAPHS, MODERATION_REASONS } from '@/lib/ratings-policy-copy'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  if (!userRatingsEnabled()) notFound()
  return policyPageMetadata({
    title: 'Review guidelines',
    description: 'Rules for user ratings on BestBotFor. Lawyer review was recorded on October 17, 2026. User ratings are not launched.',
    path: '/review-guidelines',
  })
}

export default function ReviewGuidelinesPage() {
  if (!userRatingsEnabled()) notFound()
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Review guidelines', path: '/review-guidelines' }]} />
      <h1 className="font-bold text-5xl">Review guidelines</h1>
      <LawyerReviewNotice />
      {GUIDELINES_PARAGRAPHS.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2 className="font-semibold text-3xl">Reasons a rating can be refused or removed</h2>
      <p>Each reason is neutral about whether the rating is positive or negative.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Moderation reasons</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Code</th>
              <th scope="col" className="py-2">What it means</th>
            </tr>
          </thead>
          <tbody>
            {MODERATION_REASONS.map((row) => (
              <tr key={row.code} className="border-b border-line">
                <th scope="row" className="py-3 pr-3 font-normal">{row.code}</th>
                <td className="py-3">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link href="/how-user-ratings-work" className="underline">How user ratings work</Link>
      </p>
    </article>
  )
}
