export const CONSENT_COOKIE = 'bbf_consent'

/** Fired when the visitor accepts or rejects analytics, and when a stored accept is applied. */
export const CONSENT_EVENT = 'bbf-consent'

export function readConsent(): 'granted' | 'denied' | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
  const value = match?.split('=')[1]
  if (value === 'granted' || value === 'denied') return value
  return null
}
