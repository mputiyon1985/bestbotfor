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
        <a href="/disclosure" className="underline">Disclosures</a>.
      </span>
    )
  }
  if (!vendor) return null
  return (
    <span className="block text-sm text-muted" data-affiliate-disclosure="official">
      This button opens {vendor}’s site. The address is the official URL in our catalog, not an affiliate link.{' '}
      <a href="/disclosure" className="underline">Disclosures</a>.
    </span>
  )
}

/**
 * Site-wide line on /best, tool, and result pages. A plain anchor, not a
 * client Link, so the note does not prefetch /disclosure or add a hydration
 * boundary on the long match lists.
 */
export function AffiliatePageNotice() {
  return (
    <p className="text-sm text-muted" data-affiliate-page-notice>
      {AFFILIATE_PAGE_NOTICE}{' '}
      <a href="/disclosure" className="underline">Disclosures</a>.
    </p>
  )
}
