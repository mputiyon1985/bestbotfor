import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
const clerkOn = publishableKey.startsWith('pk_')

const shell = clerkOn
  ? `import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'

export function ClerkShell({
  children,
  nonce,
  publishableKey,
}: {
  children: ReactNode
  nonce?: string
  publishableKey?: string
}) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      dynamic
      nonce={nonce}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/members"
      signUpFallbackRedirectUrl="/members"
    >
      {children}
    </ClerkProvider>
  )
}
`
  : `import type { ReactNode } from 'react'

export function ClerkShell({ children }: { children: ReactNode; nonce?: string; publishableKey?: string }) {
  return children
}
`

const slot = clerkOn
  ? `export { MemberButton as MemberButtonSlot } from './member-button'
`
  : `export function MemberButtonSlot() {
  return null
}
`

async function main(): Promise<void> {
  const root = process.cwd()
  await writeFile(path.join(root, 'src/components/clerk-shell.tsx'), shell)
  await writeFile(path.join(root, 'src/components/member-button-slot.tsx'), slot)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
