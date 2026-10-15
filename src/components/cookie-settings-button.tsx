'use client'

export const OPEN_CONSENT_EVENT = 'bbf-open-consent'

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="underline-offset-4 hover:underline"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Cookie settings
    </button>
  )
}
