'use client'

import { useEffect, useState } from 'react'

const COOKIE = 'bbf_consent'

function readChoice(): 'granted' | 'denied' | null {
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

export function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(readChoice() === null)
  }, [])

  if (!visible) return null

  return (
    <div
      role="region"
      aria-label="Analytics cookies"
      className="border-t border-line bg-card px-4 py-4"
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

export const consentDefaultScript = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'allow_google_signals', false);
try {
  if (document.cookie.indexOf('${COOKIE}=granted') !== -1) {
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }
} catch (e) {}
`
