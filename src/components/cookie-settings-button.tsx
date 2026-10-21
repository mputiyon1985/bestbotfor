'use client'

export const OPEN_CONSENT_EVENT = 'bbf-open-consent'

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 scroll-mb-24 items-center leading-tight underline-offset-4 hover:underline md:min-h-8"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Cookie settings
    </button>
  )
}
