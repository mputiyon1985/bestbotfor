/** Display size for every tool mark. Fixed so the cards do not shift. */
export const TOOL_LOGO_SIZE = 40

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
