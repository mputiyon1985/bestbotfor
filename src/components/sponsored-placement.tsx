import Link from 'next/link'
import type { ActiveBestPlacement } from '@/lib/best-placement'

/** Renders nothing unless the placement comes from an active sponsorship. */
export function SponsoredPlacement({ placement }: { placement: ActiveBestPlacement | null }) {
  if (!placement) return null
  const who = placement.company ?? 'A company'
  return (
    <aside aria-label={placement.label} className="rounded-2xl border border-line bg-mist px-4 py-3">
      <p className="text-sm font-semibold">{placement.label}</p>
      <p className="mt-1 text-sm">
        {who} paid for a featured placement on this page. It is separate from the editorial ranking.{' '}
        <Link href="/disclosure" className="underline">
          Affiliate disclosure
        </Link>
        .
      </p>
    </aside>
  )
}
