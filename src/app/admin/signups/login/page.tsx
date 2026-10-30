import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { requireSignupsSession } from '@/lib/signups/access'
import { LOGIN_CSRF_HEADER } from '@/lib/signups/auth/login-csrf'
import { SIGNUPS_HOME } from '@/lib/signups/paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function SignupsLoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const access = await requireSignupsSession()
  if (!access.configured) notFound()
  if (access.session) redirect(SIGNUPS_HOME)

  const params = await searchParams
  const csrf = (await headers()).get(LOGIN_CSRF_HEADER) ?? ''
  const showError = params.e === '1'

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-card p-6">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">Password and authentication code.</p>
      {showError ? (
        <p className="mt-3 text-danger" role="alert">
          Invalid credentials.
        </p>
      ) : null}
      <form method="post" action="/admin/signups/login/submit" className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="csrf" value={csrf} />
        <label className="flex flex-col gap-1 text-sm text-muted">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Authentication code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={8}
            required
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink"
          />
        </label>
        <button type="submit" className="mt-1 min-h-11 rounded-lg bg-indigo font-semibold text-white">
          Sign in
        </button>
      </form>
    </div>
  )
}
