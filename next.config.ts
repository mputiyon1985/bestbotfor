import type { NextConfig } from 'next'
import {
  ANDROID_CHROME_192_PATH,
  APPLE_TOUCH_ICON_PATH,
  FAVICON_16_PATH,
  FAVICON_32_PATH,
  FAVICON_48_PATH,
  HASHED_ASSET_CACHE_CONTROL,
  HASHED_ASSET_PATHS,
  LOGO_DARK_PATH,
  LOGO_DARK_RASTER_PATH,
  LOGO_LIGHT_PATH,
  LOGO_LIGHT_RASTER_PATH,
  MASKABLE_ICON_PATH,
  OG_IMAGE_PATH,
  OG_IMAGE_SVG_PATH,
  ORGANIZATION_LOGO_PATH,
  SVG_CONTENT_SECURITY_POLICY,
} from './src/lib/brand'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // same-origin-allow-popups keeps Clerk OAuth popups working. same-origin alone breaks them.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

const legacyAssetRedirects: { source: string; destination: string }[] = [
  { source: '/opengraph-image', destination: OG_IMAGE_PATH },
  { source: '/icon.svg', destination: '/favicon.svg' },
  { source: '/manifest.webmanifest', destination: '/site.webmanifest' },
  { source: '/brand/bestbotfor-lockup-light.svg', destination: LOGO_LIGHT_PATH },
  { source: '/brand/bestbotfor-lockup-dark.svg', destination: LOGO_DARK_PATH },
  { source: '/brand/bestbotfor-lockup-light@2x.png', destination: LOGO_LIGHT_RASTER_PATH },
  { source: '/brand/bestbotfor-lockup-dark@2x.png', destination: LOGO_DARK_RASTER_PATH },
  { source: '/og/og-default-1200x630.png', destination: OG_IMAGE_PATH },
  { source: '/og/og-default-1200x630.svg', destination: OG_IMAGE_SVG_PATH },
  { source: '/apple-touch-icon.png', destination: APPLE_TOUCH_ICON_PATH },
  { source: '/android-chrome-192.png', destination: ANDROID_CHROME_192_PATH },
  { source: '/android-chrome-512.png', destination: ORGANIZATION_LOGO_PATH },
  { source: '/maskable-512.png', destination: MASKABLE_ICON_PATH },
  { source: '/favicon-16.png', destination: FAVICON_16_PATH },
  { source: '/favicon-32.png', destination: FAVICON_32_PATH },
  { source: '/favicon-48.png', destination: FAVICON_48_PATH },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Tailwind CSS is small enough to inline, so the first paint does not wait on a stylesheet.
    inlineCss: true,
  },
  async redirects() {
    return [
      ...legacyAssetRedirects.map((redirect) => ({ ...redirect, permanent: true as const })),
      { source: '/tools/devin-desktop', destination: '/tools/windsurf', statusCode: 301 as const },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/:path*.svg',
        headers: [{ key: 'Content-Security-Policy', value: SVG_CONTENT_SECURITY_POLICY }],
      },
      ...HASHED_ASSET_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: HASHED_ASSET_CACHE_CONTROL }],
      })),
      // Slug URLs, not content hashes. A replaced tile waits out the year.
      {
        source: '/logos/:path*',
        headers: [{ key: 'Cache-Control', value: HASHED_ASSET_CACHE_CONTROL }],
      },
    ]
  },
}

export default nextConfig
