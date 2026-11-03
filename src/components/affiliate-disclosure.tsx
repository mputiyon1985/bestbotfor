import Link from 'next/link'
import { AFFILIATE_BUTTON_NOTE, AFFILIATE_PAGE_NOTICE } from '@/lib/affiliate-copy'

/** Shown right next to a Visit button. The affiliate sentence appears only when that redirect is active. */
export function AffiliateDisclosure({
  affiliate,
  vendor,
}: {
  affiliate: boolean
  vendor?: string
}) {
  if (affiliate) {
    return (
      <span className="block text-sm text-muted" data-affiliate-disclosure="affiliate">
        {AFFILIATE_BUTTON_NOTE}{' '}
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

/** Site-wide line on /best, tool, and result pages. It does not claim this particular button is an affiliate link. */
export function AffiliatePageNotice() {
  return (
    <p className="text-sm text-muted" data-affiliate-page-notice>
      {AFFILIATE_PAGE_NOTICE}{' '}
      <Link href="/disclosure" className="underline">Disclosures</Link>.
    </p>
  )
}
