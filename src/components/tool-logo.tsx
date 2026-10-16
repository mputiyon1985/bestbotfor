import Image from 'next/image'
import { resolveToolLogo } from '@/lib/tool-logo'

/**
 * Official mark when we have a self-hosted tile, otherwise the first letter
 * on brand indigo. The monogram is drawn here and is not a file in public/.
 */
export function ToolLogo({ name, slug }: { name: string; slug: string }) {
  const logo = resolveToolLogo(slug, name)
  if (logo.kind === 'file') {
    return (
      <Image
        src={logo.src}
        alt={logo.alt}
        width={logo.width}
        height={logo.height}
        className="shrink-0"
        style={{ width: logo.width, height: logo.height }}
      />
    )
  }
  return (
    <span
      role="img"
      aria-label={logo.alt}
      className="inline-flex shrink-0 items-center justify-center rounded-[8px] bg-indigo font-semibold text-white"
      style={{ width: logo.width, height: logo.height, fontSize: 18 }}
    >
      <span aria-hidden="true">{logo.letter}</span>
    </span>
  )
}
