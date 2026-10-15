'use client'

import { SignIn } from '@clerk/nextjs'

export function SignInPanel() {
  return (
    <SignIn
      appearance={{
        variables: {
          colorPrimary: '#1b4332',
          colorBackground: '#fffdf8',
          colorForeground: '#1c1915',
          borderRadius: '0.75rem',
        },
      }}
    />
  )
}
