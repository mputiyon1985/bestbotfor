'use client'

import { SignIn } from '@clerk/nextjs'
import { BRAND } from '@/lib/brand'

export function SignInPanel() {
  return (
    <SignIn
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
