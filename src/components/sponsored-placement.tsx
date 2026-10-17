import Link from 'next/link'
import type { ActiveBestPlacement } from '@/lib/best-placement'
import { parseSponsorHttpsUrl } from '@/lib/sponsor-card'
import { sanitizeSponsorCompany } from '@/lib/sponsor-company'

const LOGO_SRC = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

/** True when the Sponsored box will include the approved card. */
export function sponsoredCardIsVisible(placement: ActiveBestPlacement | null): placement is ActiveBestPlacement {
  if (!placement) return false
  if (!parseSponsorHttpsUrl(placement.card.url)) return false
  const name = sanitizeSponsorCompany(placement.card.name)
  const description = sanitizeSponsorCompany(placement.card.description)
  return name.length > 0 && description.length > 0
}

/** Renders nothing unless an admin-approved card is still inside its paid window. */
export function SponsoredPlacement({ placement }: { placement: ActiveBestPlacement | null }) {
  if (!sponsoredCardIsVisible(placement)) return null
  const url = parseSponsorHttpsUrl(placement.card.url)
  if (!url) return null
  const name = sanitizeSponsorCompany(placement.card.name)
  const description = sanitizeSponsorCompany(placement.card.description)
  if (!name || !description) return null
  const logoSrc = LOGO_SRC.test(placement.card.logoSrc) ? placement.card.logoSrc : null
  const company = sanitizeSponsorCompany(placement.company ?? '')
  const who = company.length > 0 ? company : 'A company'
  return (
    <aside aria-labelledby="sponsored-placement-heading" className="border-t border-line pt-8">
      <div className="rounded-2xl border border-line bg-mist px-4 py-3">
        <h2 id="sponsored-placement-heading" className="text-sm font-semibold">
          {placement.label}
        </h2>
        <div className="mt-3 flex items-start gap-3">
          {logoSrc ? <img src={logoSrc} alt="" width={40} height={40} className="h-10 w-10 rounded-lg" /> : null}
          <div>
            <a href={`/go/s/${placement.sponsorshipId}`} rel="sponsored nofollow" className="font-semibold underline">
              {name}
            </a>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        </div>
        <p className="mt-3 text-sm">
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
