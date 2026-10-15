'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Script from 'next/script'
import { analyticsPageView, googleAnalyticsBootstrap } from '@/lib/analytics-page'

export function GoogleAnalyticsScripts({ gaId, nonce }: { gaId: string; nonce?: string }) {
  return (
    <>
      <Script id="ga-config" strategy="beforeInteractive" nonce={nonce}>
        {googleAnalyticsBootstrap(gaId)}
      </Script>
      <Script id="ga-src" src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" nonce={nonce} />
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
