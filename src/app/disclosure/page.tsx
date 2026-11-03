import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { toolSeeds } from '@/data/catalog'
import { DISCLOSURE_UPDATED } from '@/lib/affiliate-copy'
import { PREPARED_AFFILIATE_SLUGS } from '@/lib/affiliate-admin'
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
  const partners = PREPARED_AFFILIATE_SLUGS.map((slug) => toolSeeds.find((tool) => tool.slug === slug)).filter(
    (tool) => tool != null,
  )
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Disclosures', path: '/disclosure' }]} />
      <h1 className="font-bold text-5xl">Disclosures</h1>
      <p>Updated {DISCLOSURE_UPDATED}.</p>
      <p>
        Some Visit links are affiliate links. BestBotFor may earn a commission at no extra cost to you. Commissions
        never affect rankings or scores.
      </p>
      <p>
        A Visit button is an affiliate link only when that tool’s program is switched on and a tracking link is on file.
        The note right next to it says “Affiliate link: we may earn a commission.” Those links use rel=&quot;sponsored&quot;.
        Every other Visit button goes to the tool’s official website.
      </p>
      <p>
        These partner tools are prepared and switched off. None of them is active, and no affiliate link for them is
        stored in the site.
      </p>
      <ul className="list-disc space-y-1 pl-6">
        {partners.map((tool) => (
          <li key={tool.slug}>
            {tool.name}
            {tool.affiliate.network ? ` (${tool.affiliate.network})` : ''} — switched off
          </li>
        ))}
      </ul>
      <p>
        Commission notes on a tool profile are copied from the vendor’s own page. If the vendor did not publish a rate,
        we do not invent one. A note on the page is not itself an affiliate link.
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
