import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { headers } from 'next/headers'
import { ClerkShell } from '@/components/clerk-shell'
import { ConsentBanner } from '@/components/consent-banner'
import { JsonLd } from '@/components/json-ld'
import { SiteAnalytics } from '@/components/site-analytics'
import { FirstTouchCapture } from '@/components/first-touch-capture'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SuggestionDialog, SuggestSomethingLink } from '@/components/suggest-something'
import { APPLE_TOUCH_ICON_PATH, BRAND, OG_IMAGE_PATH } from '@/lib/brand'
import { secGpcOptOut } from '@/lib/gpc'
import { isProductionDeployment } from '@/lib/indexing'
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld'
import { homeDescription, homeTitle } from '@/lib/metadata'
import { getSiteUrl, SITE_NAME, TAGLINE, TWITTER_SITE } from '@/lib/site'
import { gaIdSchema } from '@/lib/validation'
import './globals.css'

const poppins = localFont({
  src: [
    { path: '../fonts/Poppins-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/Poppins-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/Poppins-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/Poppins-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
  adjustFontFallback: 'Arial',
  // Preload would finish before first paint on a fast connection, and Lighthouse
  // then treats those files as blocking the largest paint.
  preload: false,
})

const verification = process.env.GOOGLE_SITE_VERIFICATION?.trim()
const googleVerification = verification && /^[A-Za-z0-9_-]+$/.test(verification) ? verification : undefined
const gaId = gaIdSchema.safeParse(process.env.NEXT_PUBLIC_GA_ID?.trim() ?? '')

const ogImage = { url: OG_IMAGE_PATH, width: 1200, height: 630, alt: TAGLINE }

export const viewport: Viewport = {
  themeColor: BRAND.indigo,
  colorScheme: 'light dark',
}

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: homeTitle, template: `%s · ${SITE_NAME}` },
  description: homeDescription,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: APPLE_TOUCH_ICON_PATH, sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: homeTitle,
    description: homeDescription,
    url: getSiteUrl(),
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    images: [ogImage],
  },
  twitter: { card: 'summary_large_image', site: TWITTER_SITE, title: homeTitle, description: TAGLINE, images: [ogImage] },
  verification: googleVerification ? { google: googleVerification } : undefined,
  robots: isProductionDeployment() ? { index: true, follow: true } : { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headerStore = await headers()
  const nonce = headerStore.get('x-nonce')
  const secGpc = secGpcOptOut(headerStore.get('sec-gpc'))
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''

  const content = (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto min-h-[70vh] min-w-0 max-w-5xl px-4 pt-14 pb-10 md:py-10">
        {children}
        <div id="suggest-something" className="mt-12 scroll-mb-24">
          <SuggestSomethingLink className="inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline" />
        </div>
      </main>
      <SiteFooter />
      <SuggestionDialog />
      <ConsentBanner gaId={gaId.success ? gaId.data : null} secGpc={secGpc} />
      <JsonLd data={websiteJsonLd()} nonce={nonce} />
      <JsonLd data={organizationJsonLd()} nonce={nonce} />
      <SiteAnalytics secGpc={secGpc} />
      <FirstTouchCapture />
    </>
  )

  const shell = (
    <ClerkShell nonce={nonce ?? undefined} publishableKey={publishableKey}>
      {content}
    </ClerkShell>
  )

  return (
    <html lang="en-US" className={poppins.variable}>
      <body className="antialiased">
        {shell}
        <script
          nonce={nonce ?? undefined}
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){var style=document.createElement('style');style.textContent='html{font-family:var(--font-poppins),bbf-metric,ui-sans-serif,system-ui,sans-serif}';document.head.appendChild(style)},300)`,
          }}
        />
      </body>
    </html>
  )
}
