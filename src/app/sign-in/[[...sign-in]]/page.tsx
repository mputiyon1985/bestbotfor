import type { Metadata } from 'next'
import Link from 'next/link'
import { SignInPanel } from '@/components/sign-in-panel'
import { isClerkConfigured } from '@/lib/flags'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Sign in',
  description: 'Sign in to BestBotFor to save picks and open members-only notes.',
  path: '/sign-in',
  noIndex: true,
})

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <article className="max-w-xl space-y-4">
        <h1 className="font-serif text-5xl">Sign in</h1>
        <p>Sign-in is not configured on this server yet. The picker still works without an account.</p>
        <Link href="/" className="inline-flex min-h-12 items-center font-semibold underline">
          Back home
        </Link>
      </article>
    )
  }
  return (
    <article className="space-y-4">
      <h1 className="font-serif text-4xl">Sign in</h1>
      <SignInPanel />
    </article>
  )
}
