'use client'

import { SignUp } from '@clerk/nextjs'

export function SignUpPanel() {
  return (
    <SignUp
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
