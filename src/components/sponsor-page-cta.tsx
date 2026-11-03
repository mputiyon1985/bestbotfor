import Link from 'next/link'
import { sponsorPageHref } from '@/lib/sponsor-page-cta'

/**
 * Invitation to buy a featured slot. It is not a paid placement: the paid
 * card is SponsoredPlacement, which uses a different label and a mist background.
 * No script, no analytics, and the link stays on this site.
 */
export function SponsorPageCta({ taskSlug }: { taskSlug?: string | null }) {
  const href = sponsorPageHref(taskSlug)
  return (
    <aside
      aria-labelledby="sponsor-page-cta-heading"
      data-sponsor-page-cta
      className="rounded-2xl border border-line px-4 py-4"
    >
      <h2 id="sponsor-page-cta-heading" className="font-semibold text-xl">
        <Link href={href} className="inline-flex min-h-11 items-center underline">
          Sponsor this page
        </Link>
      </h2>
      <p className="mt-1 text-sm">
        <Link href={href} className="inline-flex min-h-11 items-center font-semibold underline">
          Get featured here
        </Link>
        . A paid slot on this page. It is labeled separately from the ranking and does not change it.{' '}
        <Link href="/disclosure" className="inline-flex min-h-11 items-center underline">
          Disclosures
        </Link>
        .
      </p>
      <p className="text-sm text-muted">
        Founding sponsor is $99 now, then $299/mo after 14 days, with that price locked for 6 months, limited to 5.
        Monthly sponsor is $299/mo.
      </p>
    </aside>
  )
}
