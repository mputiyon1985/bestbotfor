'use client'

import { SignUp } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { BRAND } from '@/lib/brand'
import { captureFirstTouch, type FirstTouch, readFirstTouch } from '@/lib/first-touch'

/**
 * Clerk unsafeMetadata written at sign-up. Only the first-touch record, when one was stored.
 * unsafeMetadata is client-writable, so `first_touch` is untrusted attribution only: it must
 * never drive authorization, membership, pricing, or entitlements (Sentinel P3-3 on #101).
 */
export function signUpUnsafeMetadata(firstTouch: FirstTouch | null): Record<string, unknown> | undefined {
  return firstTouch ? { first_touch: firstTouch } : undefined
}

export function SignUpPanel({ forceRedirectUrl }: { forceRedirectUrl: string }) {
  const [firstTouch, setFirstTouch] = useState<FirstTouch | null>(null)
  useEffect(() => {
    setFirstTouch(readFirstTouch() ?? captureFirstTouch(window.location))
  }, [])
  return (
    <SignUp
      forceRedirectUrl={forceRedirectUrl}
      unsafeMetadata={signUpUnsafeMetadata(firstTouch)}
      appearance={{
        variables: {
          colorPrimary: BRAND.indigo,
          colorBackground: BRAND.white,
          colorForeground: BRAND.ink,
          borderRadius: '0.75rem',
        },
      }}
    />
  )
}
