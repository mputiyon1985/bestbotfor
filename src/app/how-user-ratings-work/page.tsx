import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { userRatingsEnabled } from '@/lib/flags'
import { policyPageMetadata } from '@/lib/metadata'
import { FORMULA_LINES, FORMULA_NOTES, MODERATION_REASONS, TRANSPARENCY_PLACEHOLDER, TRUST_TIERS } from '@/lib/ratings-policy-copy'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  if (!userRatingsEnabled()) notFound()
  return policyPageMetadata({
    title: 'How user ratings work',
    description: 'How the user-rating formula, tiers, and moderation reasons work. Lawyer review was recorded on October 17, 2026. User ratings are not launched.',
    path: '/how-user-ratings-work',
  })
}

export default function HowUserRatingsWorkPage() {
  if (!userRatingsEnabled()) notFound()
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'How user ratings work', path: '/how-user-ratings-work' }]} />
      <h1 className="font-bold text-5xl">How user ratings work</h1>
      <LawyerReviewNotice />
      <h2 className="font-semibold text-3xl">Formula</h2>
      {FORMULA_LINES.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {FORMULA_NOTES.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <h2 className="font-semibold text-3xl">Trust tiers</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Trust tiers and weights</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Tier</th>
              <th scope="col" className="py-2 pr-3">Who</th>
              <th scope="col" className="py-2">Weight</th>
            </tr>
          </thead>
          <tbody>
            {TRUST_TIERS.map((row) => (
              <tr key={row.tier} className="border-b border-line">
                <th scope="row" className="py-3 pr-3 font-normal">{row.tier}</th>
                <td className="py-3 pr-3">{row.who}</td>
                <td className="py-3">{row.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="font-semibold text-3xl">Moderation reasons</h2>
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
      <h2 className="font-semibold text-3xl">Transparency</h2>
      <p>{TRANSPARENCY_PLACEHOLDER}</p>
      <p>
        <Link href="/review-guidelines" className="underline">Review guidelines</Link>
      </p>
    </article>
  )
}
