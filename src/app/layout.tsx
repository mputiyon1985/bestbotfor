import { Suspense, type ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { headers } from 'next/headers'
import Script from 'next/script'
import { ConsentBanner, consentDefaultScript } from '@/components/consent-banner'
import { GoogleAnalyticsScripts } from '@/components/google-analytics'
import { JsonLd } from '@/components/json-ld'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { APPLE_TOUCH_ICON_PATH, BRAND, OG_IMAGE_PATH } from '@/lib/brand'
import { isProductionDeployment } from '@/lib/indexing'
import { isClerkConfigured } from '@/lib/flags'
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld'
import { homeDescription, homeTitle } from '@/lib/metadata'
import { getSiteUrl, SITE_NAME, TAGLINE } from '@/lib/site'
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
    description: TAGLINE,
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
    images: [ogImage],
  },
  twitter: { card: 'summary_large_image', title: homeTitle, description: TAGLINE, images: [OG_IMAGE_PATH] },
  verification: googleVerification ? { google: googleVerification } : undefined,
  robots: isProductionDeployment() ? { index: true, follow: true } : { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce')
  const clerkOn = isClerkConfigured()
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''

  const content = (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto min-h-[70vh] max-w-5xl px-4 py-10">
        {children}
      </main>
      <SiteFooter />
      <ConsentBanner />
      <JsonLd data={websiteJsonLd()} nonce={nonce} />
      <JsonLd data={organizationJsonLd()} nonce={nonce} />
      <Analytics />
      {gaId.success ? (
        <Suspense fallback={null}>
          <GoogleAnalyticsScripts gaId={gaId.data} nonce={nonce ?? undefined} />
        </Suspense>
      ) : null}
    </>
  )

  let shell = content
  if (clerkOn) {
    const { ClerkProvider } = await import('@clerk/nextjs')
    shell = (
      <ClerkProvider
        publishableKey={publishableKey}
        dynamic
        nonce={nonce ?? undefined}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/members"
        signUpFallbackRedirectUrl="/members"
      >
        {content}
      </ClerkProvider>
    )
  }

  return (
    <html lang="en-US" className={poppins.variable}>
      <body className="antialiased">
        {gaId.success ? (
          <Script id="ga-consent-default" strategy="beforeInteractive" nonce={nonce ?? undefined}>
            {consentDefaultScript}
          </Script>
        ) : null}
        {shell}
        <script
          nonce={nonce ?? undefined}
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){var style=document.createElement('style');style.textContent='html{font-family:var(--font-poppins),Poppins,ui-sans-serif,system-ui,sans-serif}';document.head.appendChild(style)},300)`,
          }}
        />
      </body>
    </html>
  )
}
