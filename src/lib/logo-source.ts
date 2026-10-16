/** Display size for every tool mark. Fixed so the cards do not shift. */
export const TOOL_LOGO_SIZE = 40

/** Raster tile written under public/logos. The page still draws it at TOOL_LOGO_SIZE. */
export const LOGO_TILE_SIZE = 128

/**
 * Longest side of the mark as a fraction of the tile.
 * The fetch script uses this for padding. The monogram uses the same share.
 */
export const TOOL_LOGO_MARK_FILL = 0.8

/**
 * Font size for the monogram tile. In the brand face the letter's layout box
 * is 32/23 of the font size, so this fills TOOL_LOGO_MARK_FILL of the tile.
 */
export function monogramFontSize(tileSize = TOOL_LOGO_SIZE): number {
  const layoutBoxPerEm = 32 / 23
  return Math.round((tileSize * TOOL_LOGO_MARK_FILL) / layoutBoxPerEm)
}

/** Self-hosted tiles. Pages must not import the source-url manifest. */
export const LOGO_PUBLIC_DIR = 'public/logos'

export const LOGO_MANIFEST_PATH = 'src/data/logo-manifest.json'

export function logoAlt(name: string): string {
  return `${name} logo`
}

/** First letter of the tool name, for the monogram tile. */
export function monogramLetter(name: string): string {
  const trimmed = name.trim()
  const match = trimmed.match(/\p{L}|\p{N}/u)
  const char = match?.[0] ?? trimmed[0] ?? '?'
  return char.toLocaleUpperCase('en-US')
}
