import { readFileSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { LOGO_DARK_PATH, LOGO_LIGHT_PATH } from '@/lib/brand'

function inlineLockup(publicPath: string): string {
  const file = path.join(process.cwd(), 'public', publicPath.replace(/^\/+/, ''))
  const raw = readFileSync(file, 'utf8')
  if (raw.includes('<script')) throw new Error('lockup svg contains a script')
  return raw.replace(/^<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\s(?:width|height)="[^"]*"/g, '')
    return `<svg${cleaned} aria-hidden="true" focusable="false">`
  })
}

const lightMarkup = inlineLockup(LOGO_LIGHT_PATH)
const darkMarkup = inlineLockup(LOGO_DARK_PATH)

/**
 * Horizontal lockup from the brand kit, inlined so the header does not wait on an image request.
 * Light artwork on white; dark artwork on ink. A 40px height keeps the wordmark above the 120px minimum.
 */
export function BrandLockup() {
  return (
    <Link href="/" aria-label="BestBotFor" className="relative z-10 inline-flex h-10 shrink-0 items-center overflow-hidden">
      <span className="dark:hidden [&_svg]:h-10 [&_svg]:w-auto" dangerouslySetInnerHTML={{ __html: lightMarkup }} />
      <span className="hidden dark:block [&_svg]:h-10 [&_svg]:w-auto" dangerouslySetInnerHTML={{ __html: darkMarkup }} />
    </Link>
  )
}
