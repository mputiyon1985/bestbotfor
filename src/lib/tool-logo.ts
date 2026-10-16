import logoSlugs from '@/data/logo-slugs.json'
import { logoAlt, monogramLetter, TOOL_LOGO_SIZE } from './logo-source'

export { logoAlt, LOGO_MANIFEST_PATH, LOGO_PUBLIC_DIR, LOGO_TILE_SIZE, monogramFontSize, monogramLetter, TOOL_LOGO_MARK_FILL, TOOL_LOGO_SIZE } from './logo-source'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type ResolvedToolLogo =
  | { kind: 'file'; src: string; alt: string; width: number; height: number }
  | { kind: 'monogram'; letter: string; alt: string; width: number; height: number }

const files = new Set((logoSlugs as string[]).filter((slug) => SLUG.test(slug)))

export function logoFileSlugs(): Set<string> {
  return files
}

export function resolveToolLogo(slug: string, name: string): ResolvedToolLogo {
  const alt = logoAlt(name)
  const width = TOOL_LOGO_SIZE
  const height = TOOL_LOGO_SIZE
  if (SLUG.test(slug) && files.has(slug)) {
    return { kind: 'file', src: `/logos/${slug}.webp`, alt, width, height }
  }
  return { kind: 'monogram', letter: monogramLetter(name), alt, width, height }
}
