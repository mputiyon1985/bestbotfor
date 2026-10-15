import Link from 'next/link'
import { LOGO_DARK_PATH, LOGO_LIGHT_PATH } from '@/lib/brand'

/**
 * Horizontal lockup from the brand kit, uncropped.
 * Light artwork on white; dark artwork on ink. Minimum digital width is 120px;
 * a 40px height keeps the wordmark wider than that.
 */
export function BrandLockup() {
  const shared = {
    alt: '',
    width: 427,
    height: 100,
  }

  return (
    <Link href="/" aria-label="BestBotFor" className="inline-flex shrink-0">
      <img
        {...shared}
        src={LOGO_LIGHT_PATH}
        className="h-10 w-auto dark:hidden"
      />
      <img
        {...shared}
        src={LOGO_DARK_PATH}
        className="hidden h-10 w-auto dark:block"
      />
    </Link>
  )
}
