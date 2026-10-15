import { Suspense, type ReactNode } from 'react'
import type { Metadata } from 'next'
import { Fraunces, Source_Sans_3 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { cookies, headers } from 'next/headers'
import { ConsentBanner } from '@/components/consent-banner'
import { GoogleAnalyticsScripts } from '@/components/google-analytics'
import { JsonLd } from '@/components/json-ld'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { isClerkConfigured } from '@/lib/flags'
import { organizationJsonLd, websiteJsonLd } from '@/lib/jsonld'
import { homeDescription, homeTitle } from '@/lib/metadata'
import { getSiteUrl, SITE_NAME, TAGLINE } from '@/lib/site'
import { gaIdSchema } from '@/lib/validation'
import './globals.css'

const sans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-source',
  display: 'swap',
})

const serif = Fraunces({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-fraunces',
  display: 'swap',
})

const verification = process.env.GOOGLE_SITE_VERIFICATION?.trim()
const googleVerification = verification && /^[A-Za-z0-9_-]+$/.test(verification) ? verification : undefined
const gaId = gaIdSchema.safeParse(process.env.NEXT_PUBLIC_GA_ID?.trim() ?? '')

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: homeTitle, template: `%s · ${SITE_NAME}` },
  description: homeDescription,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: {
    title: homeTitle,
    description: TAGLINE,
    siteName: SITE_NAME,
    locale: 'en_US',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: homeTitle, description: TAGLINE },
  verification: googleVerification ? { google: googleVerification } : undefined,
  robots: { index: true, follow: true },
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce')
  const analyticsGranted = (await cookies()).get('bbf_consent')?.value === 'granted'
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
          <GoogleAnalyticsScripts gaId={gaId.data} nonce={nonce ?? undefined} initialGranted={analyticsGranted} />
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
    <html lang="en-US" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans antialiased">{shell}</body>
    </html>
  )
}
