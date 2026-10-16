/**
 * Palette from the BestBotFor brand sheet (v1.0, Oct 2026), concept 1.
 * Indigo, mint, ink, white, and soft indigo are the named swatches.
 * Surfaces mix those colors so light and dark text stay WCAG AA.
 */
export const BRAND = {
  indigo: '#5B4BFF',
  mint: '#2EE6A8',
  ink: '#12122B',
  white: '#FFFFFF',
  softIndigo: '#8F84FF',
} as const

/** Content hash (sha256, first 8 hex chars) so these URLs can be cached for a year. */
export const LOGO_LIGHT_PATH = '/brand/bestbotfor-lockup-light.db91a59b.svg'
export const LOGO_DARK_PATH = '/brand/bestbotfor-lockup-dark.010fa368.svg'
/** Uncropped 2× raster of the dark lockup, used on generated link previews. */
export const LOGO_DARK_RASTER_PATH = '/brand/bestbotfor-lockup-dark@2x.1c60afa1.png'
export const LOGO_LIGHT_RASTER_PATH = '/brand/bestbotfor-lockup-light@2x.6087a333.png'
export const OG_IMAGE_PATH = '/og/og-default-1200x630.676bae0e.png'
export const OG_IMAGE_SVG_PATH = '/og/og-default-1200x630.1ab473e6.svg'
/** Placeholder headline card for future previews. Not the default share image. */
export const OG_HEADLINE_TEMPLATE_PATH = '/og/og-template-headline-1200x630.svg'
export const ORGANIZATION_LOGO_PATH = '/android-chrome-512.7e4c642b.png'
export const APPLE_TOUCH_ICON_PATH = '/apple-touch-icon.0619ce72.png'
export const ANDROID_CHROME_192_PATH = '/android-chrome-192.f351b443.png'
export const MASKABLE_ICON_PATH = '/maskable-512.75a80052.png'
export const FAVICON_16_PATH = '/favicon-16.f118ee4b.png'
export const FAVICON_32_PATH = '/favicon-32.d397920e.png'
export const FAVICON_48_PATH = '/favicon-48.f3852d13.png'

export const HASHED_ASSET_PATHS = [
  LOGO_LIGHT_PATH,
  LOGO_DARK_PATH,
  LOGO_LIGHT_RASTER_PATH,
  LOGO_DARK_RASTER_PATH,
  OG_IMAGE_PATH,
  OG_IMAGE_SVG_PATH,
  ORGANIZATION_LOGO_PATH,
  APPLE_TOUCH_ICON_PATH,
  ANDROID_CHROME_192_PATH,
  MASKABLE_ICON_PATH,
  FAVICON_16_PATH,
  FAVICON_32_PATH,
  FAVICON_48_PATH,
] as const

export const HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** SVGs are skipped by the nonce middleware, so the file response carries its own policy. */
export const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
