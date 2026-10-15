'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { CONSENT_EVENT, readConsent } from '@/components/consent-banner'
import { analyticsPageView, googleAnalyticsBootstrap } from '@/lib/analytics-page'

/**
 * Consent Mode basic: gtag.js is not rendered, and no Google request is made,
 * until the visitor has accepted analytics. A granted cookie from an earlier
 * visit is the only way the script is in the first HTML response.
 */
export function GoogleAnalyticsScripts({
  gaId,
  nonce,
  initialGranted,
}: {
  gaId: string
  nonce?: string
  initialGranted: boolean
}) {
  const [granted, setGranted] = useState(initialGranted)

  useEffect(() => {
    const sync = () => setGranted(readConsent() === 'granted')
    sync()
    window.addEventListener(CONSENT_EVENT, sync)
    return () => window.removeEventListener(CONSENT_EVENT, sync)
  }, [])

  if (!granted) return null

  return (
    <>
      <Script id="ga-config" strategy="afterInteractive" nonce={nonce}>
        {googleAnalyticsBootstrap(gaId)}
      </Script>
      <Script
        id="ga-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      <SanitizedPageViews />
    </>
  )
}

function SanitizedPageViews() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()

  useEffect(() => {
    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof gtag !== 'function') return
    const href = new URL(query ? `${pathname}?${query}` : pathname, window.location.origin).toString()
    const view = analyticsPageView({ href, referrer: document.referrer || undefined })
    gtag('event', 'page_view', view)
  }, [pathname, query])

  return null
}
