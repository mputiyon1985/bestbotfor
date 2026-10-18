'use client'

import { SignUp } from '@clerk/nextjs'
import { BRAND } from '@/lib/brand'

export function SignUpPanel({ forceRedirectUrl }: { forceRedirectUrl: string }) {
  return (
    <SignUp
      forceRedirectUrl={forceRedirectUrl}
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
