'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics'
import { CONSENT_EVENT, readConsent } from '@/lib/consent'
import { signUpTrackDecision } from '@/lib/sign-up-analytics'

const STORAGE_KEY = 'bbf_sign_up_tracked'

function gtagReady(): boolean {
  return typeof (window as Window & { gtag?: unknown }).gtag === 'function'
}

function trackedUserId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function remember(userId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, userId)
  } catch {
    // The event already went out. A refresh in this tab may send it once more.
  }
}

/** Sends GA4 sign_up once for a new Clerk account, and only after consent. */
export function SignUpEvent() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [consentTick, setConsentTick] = useState(0)

  useEffect(() => {
    const onConsent = () => setConsentTick((value) => value + 1)
    window.addEventListener(CONSENT_EVENT, onConsent)
    return () => window.removeEventListener(CONSENT_EVENT, onConsent)
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return
    const decision = signUpTrackDecision({
      consent: readConsent(),
      gtagReady: gtagReady(),
      signedIn: Boolean(isSignedIn),
      userId: user.id,
      createdAtMs: user.createdAt ? user.createdAt.getTime() : null,
      now: Date.now(),
      trackedUserId: trackedUserId(),
    })
    if (decision !== 'track') return
    if (!track('sign_up', { method: 'clerk' })) return
    remember(user.id)
  }, [isLoaded, isSignedIn, user, consentTick])

  return null
}
