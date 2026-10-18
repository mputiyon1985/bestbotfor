import type { Metadata } from 'next'
import Link from 'next/link'
import { SignUpPanel } from '@/components/sign-up-panel'
import { isClerkConfigured } from '@/lib/flags'
import { pageMetadata } from '@/lib/metadata'
import { signUpRedirect } from '@/lib/save-pick-prompt'
import { firstString } from '@/lib/validation'

export const metadata: Metadata = pageMetadata({
  title: 'Create an account',
  description: 'Create a BestBotFor account to save picks.',
  path: '/sign-up',
  noIndex: true,
})

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const redirectUrl = signUpRedirect(firstString((await searchParams).redirect_url))
  if (!isClerkConfigured()) {
    return (
      <article className="max-w-xl space-y-4">
        <h1 className="font-bold text-5xl">Create an account</h1>
        <p>Account creation is not configured on this server yet.</p>
        <Link href="/" className="font-semibold underline">
          Back home
        </Link>
      </article>
    )
  }
  return (
    <article className="space-y-4">
      <h1 className="font-bold text-4xl">Create an account</h1>
      <SignUpPanel forceRedirectUrl={redirectUrl} />
    </article>
  )
}
