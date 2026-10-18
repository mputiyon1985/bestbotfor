import Link from 'next/link'
import type { ActiveBestPlacement } from '@/lib/best-placement'
import { sanitizeSponsorCompany } from '@/lib/sponsor-company'

/** Renders nothing unless the placement comes from an active sponsorship. */
export function SponsoredPlacement({ placement }: { placement: ActiveBestPlacement | null }) {
  if (!placement) return null
  const company = sanitizeSponsorCompany(placement.company ?? '')
  const who = company.length > 0 ? company : 'A company'
  return (
    <aside aria-labelledby="sponsored-placement-heading" className="border-t border-line pt-8">
      <div className="rounded-2xl border border-line bg-mist px-4 py-3">
        <h2 id="sponsored-placement-heading" className="text-sm font-semibold">
          {placement.label}
        </h2>
        <p className="mt-1 text-sm">
          {who} paid for a featured placement on this page. It is separate from the editorial ranking.{' '}
          <Link href="/disclosure" className="underline">
            Disclosures
          </Link>
          .
        </p>
      </div>
    </aside>
  )
}
