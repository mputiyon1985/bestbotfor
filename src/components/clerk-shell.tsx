import type { ReactNode } from 'react'

export function ClerkShell({ children }: { children: ReactNode; nonce?: string; publishableKey?: string }) {
  return children
}
