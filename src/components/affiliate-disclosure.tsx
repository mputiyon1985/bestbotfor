import Link from 'next/link'

/** Shown right next to a Visit button. Affiliate wording appears only when the tool has a real affiliate URL. */
export function AffiliateDisclosure({ affiliate, vendor }: { affiliate: boolean; vendor?: string }) {
  if (affiliate) {
    return (
      <span className="block text-sm text-muted" data-affiliate-disclosure="affiliate">
        Affiliate link: we may earn a commission if you buy through this button. It does not change our rating.{' '}
        <Link href="/disclosure" className="underline">Disclosures</Link>.
      </span>
    )
  }
  if (!vendor) return null
  return (
    <span className="block text-sm text-muted" data-affiliate-disclosure="official">
      This button opens {vendor}’s site. The address is the official URL in our catalog, not an affiliate link.{' '}
      <Link href="/disclosure" className="underline">Disclosures</Link>.
    </span>
  )
}
