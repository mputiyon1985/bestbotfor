'use client'

import { useEffect, useState } from 'react'

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

export function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(readConsent() === null)
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
              window.dispatchEvent(new Event(CONSENT_EVENT))
              setVisible(false)
            }}
          >
            Reject
          </button>
          <button
            type="button"
            className="min-h-12 rounded-full bg-forest px-4 text-sm font-semibold text-white"
            onClick={() => {
              writeChoice('granted')
              updateConsent('granted')
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
