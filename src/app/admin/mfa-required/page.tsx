import { notFound } from 'next/navigation'
import { requireMfaSetupPage } from '@/lib/admin'
import { adminSponsorsEnabled, userRatingsEnabled } from '@/lib/flags'

export const dynamic = 'force-dynamic'

export default async function AdminMfaRequiredPage() {
  if (!userRatingsEnabled() && !adminSponsorsEnabled()) notFound()
  await requireMfaSetupPage()
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="font-bold text-5xl">Set up MFA</h1>
      <p>
        Admin stays closed until this account has a second factor and this session completed it. Add an authenticator
        app or a passkey in your account settings, then sign out and sign in again with that factor.
      </p>
      <p>SMS-only is discouraged. The rest of admin is unavailable until this is done.</p>
    </article>
  )
}
