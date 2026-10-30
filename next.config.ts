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
import { curatedCompareRedirects } from './src/data/compare-copy'
import { EMAIL_ASSET_HEADERS, EMAIL_ASSET_SOURCE } from './src/lib/email-asset-headers'
import { assertReviewHmacSecrets } from './src/lib/review-hmac-secrets'

// Fail the build (and any later config load) before Next compiles pages.
assertReviewHmacSecrets()

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
  // Next's trailing-slash 308 runs before the proxy, so /admin/ and
  // /admin/signups// cannot get noindex or no-store there. The proxy sends
  // those redirects and repeats the same 308 for every other path.
  skipTrailingSlashRedirect: true,
  // Ship the seed-built catalog snapshot with every server function (read only after a Turso error).
  outputFileTracingIncludes: { '/**': ['./data/catalog-fallback.db'] },
  // Inlined at build time so the test IP hook in src/lib/reviews/ip.ts is
  // compiled out unless this build was started with BBF_E2E_HOOKS=1.
  env: {
    BBF_E2E_HOOKS: process.env.BBF_E2E_HOOKS === '1' ? '1' : '',
  },
  experimental: {
    // Tailwind CSS is small enough to inline, so the first paint does not wait on a stylesheet.
    inlineCss: true,
  },
  async redirects() {
    return [
      ...legacyAssetRedirects.map((redirect) => ({ ...redirect, permanent: true as const })),
      ...curatedCompareRedirects(),
      { source: '/tools/devin-desktop', destination: '/tools/windsurf', statusCode: 301 as const },
      // Category merge Oct 20, 2026: "Coding" (Cursor only) folded into "Coding assistant".
      {
        source: '/tools',
        has: [{ type: 'query' as const, key: 'category', value: 'coding' }],
        destination: '/tools?category=coding-assistant',
        statusCode: 301 as const,
      },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Must stay after the catch-all: Next applies the last matching value for a key.
      { source: EMAIL_ASSET_SOURCE, headers: [...EMAIL_ASSET_HEADERS] },
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
