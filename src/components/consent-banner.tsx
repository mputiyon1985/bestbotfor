'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { analyticsPageView } from '@/lib/analytics-page'
import { OPEN_CONSENT_EVENT } from './cookie-settings-button'

const COOKIE = 'bbf_consent'

export const CONSENT_EVENT = 'bbf-consent'

export function readConsent(): 'granted' | 'denied' | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${COOKIE}=`))
  const value = match?.split('=')[1]
  if (value === 'granted' || value === 'denied') return value
  return null
}

function writeChoice(value: 'granted' | 'denied') {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE}=${value}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`
}

function updateConsent(value: 'granted' | 'denied') {
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag
  if (typeof gtag !== 'function') return
  gtag('consent', 'update', {
    analytics_storage: value,
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
}

type AnalyticsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

function loadGoogleAnalytics(gaId: string) {
  const analyticsWindow = window as AnalyticsWindow
  if (typeof analyticsWindow.gtag === 'function' || document.getElementById('ga-src')) return
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
  const gtag = function gtag() {
    // gtag.js only processes Arguments objects queued on dataLayer.
    // eslint-disable-next-line prefer-rest-params
    analyticsWindow.dataLayer?.push(arguments)
  } as AnalyticsWindow['gtag']
  analyticsWindow.gtag = gtag
  gtag?.('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
  })
  gtag?.('set', 'ads_data_redaction', true)
  gtag?.('set', 'allow_google_signals', false)
  gtag?.('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag?.('js', new Date())
  gtag?.('config', gaId, { send_page_view: false })
  const script = document.createElement('script')
  script.id = 'ga-src'
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`
  document.head.appendChild(script)
}

export function ConsentBanner({ gaId }: { gaId: string | null }) {
  const [visible, setVisible] = useState(false)
  const [tracking, setTracking] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const choice = readConsent()
    setVisible(choice === null)
    if (choice === 'granted' && gaId) {
      loadGoogleAnalytics(gaId)
      setTracking(true)
    }
    const open = () => setVisible(true)
    window.addEventListener(OPEN_CONSENT_EVENT, open)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open)
  }, [gaId])

  useEffect(() => {
    if (!tracking) return
    const gtag = (window as AnalyticsWindow).gtag
    if (typeof gtag !== 'function') return
    gtag('event', 'page_view', analyticsPageView({ href: window.location.href, referrer: document.referrer || undefined }))
  }, [pathname, tracking])

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Analytics cookies"
      className="relative z-40 border-t border-line bg-card px-4 py-4"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl text-sm text-muted">
          Analytics cookies are off until you accept. We do not send your email, name, or what you type into analytics.
          Vercel Analytics stays cookieless. Read the <a className="underline" href="/privacy">privacy policy</a>.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-12 rounded-full border border-ink px-4 text-sm font-semibold"
            onClick={() => {
              writeChoice('denied')
              updateConsent('denied')
              window.dispatchEvent(new Event(CONSENT_EVENT))
              setVisible(false)
            }}
          >
            Reject
          </button>
          <button
            type="button"
            className="min-h-12 rounded-full bg-indigo px-4 text-sm font-medium text-white"
            onClick={() => {
              writeChoice('granted')
              updateConsent('granted')
              if (gaId) {
                loadGoogleAnalytics(gaId)
                setTracking(true)
              }
              window.dispatchEvent(new Event(CONSENT_EVENT))
              setVisible(false)
            }}
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  )
}
