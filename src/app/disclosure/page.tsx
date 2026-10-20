import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { userRatingsEnabled } from '@/lib/flags'
import { pageMetadata } from '@/lib/metadata'
import { DISCLOSURE_ADVERTISER_PARAGRAPH } from '@/lib/ratings-policy-copy'
import { SPONSORSHIP_DISCLOSURE } from '@/lib/sponsorship-disclosure'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Disclosures',
  description:
    'How BestBotFor handles affiliate links, paid featured placements, newsletter sponsorships, and recommendations.',
  path: '/disclosure',
})

export default function DisclosurePage() {
  const ratings = userRatingsEnabled()
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Disclosures', path: '/disclosure' }]} />
      <h1 className="font-bold text-5xl">Disclosures</h1>
      <p>
        BestBotFor may earn a commission when you buy through an affiliate link. That relationship never changes the
        editorial rank.
      </p>
      <p>
        A “Visit” button uses an affiliate link only after a program has approved us and a real tracking link is in
        place. Those buttons carry an “Affiliate link” note right next to them and are marked rel=&quot;sponsored&quot;.
        Every other button goes to the tool’s official website with no affiliate code.
      </p>
      <p>
        Commission notes on a tool profile are copied from the vendor’s own page. If the vendor did not publish a rate,
        we do not invent one.
      </p>
      <p>Recommendations are opinions based on the catalog, not a promise that a tool will work for your project.</p>
      <p>{SPONSORSHIP_DISCLOSURE}</p>
      <p>Tool logos and icons are trademarks of their owners. They are used on BestBotFor for identification only and do not imply endorsement.</p>
      {ratings ? (
        <>
          <LawyerReviewNotice />
          <p>{DISCLOSURE_ADVERTISER_PARAGRAPH}</p>
        </>
      ) : null}
    </article>
  )
}
