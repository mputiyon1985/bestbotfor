import { notFound, redirect } from 'next/navigation'
import { requireLeadsSession } from '@/lib/leads/access'
import { LEADS_HOME, LEADS_LIMIT_ERROR, LEADS_LOGIN_ERROR, LEADS_LOGIN_SUBMIT } from '@/lib/leads/paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function LeadsLoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const access = await requireLeadsSession()
  if (!access.configured) notFound()
  if (access.session) redirect(LEADS_HOME)

  const params = await searchParams
  const error = params.e === LEADS_LIMIT_ERROR ? 'limited' : params.e === LEADS_LOGIN_ERROR ? 'credentials' : null

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-card p-6">
      <h1 className="text-3xl font-bold">Leads</h1>
      <p className="mt-2 text-sm text-muted">Password.</p>
      {error === 'credentials' ? (
        <p className="mt-3 text-danger" role="alert">
          Invalid credentials.
        </p>
      ) : null}
      {error === 'limited' ? (
        <p className="mt-3 text-danger" role="alert">
          Too many attempts. Try again later.
        </p>
      ) : null}
      <form method="post" action={LEADS_LOGIN_SUBMIT} className="mt-4 flex flex-col gap-3">
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
        <button type="submit" className="mt-1 min-h-11 rounded-lg bg-indigo font-semibold text-white">
          Sign in
        </button>
      </form>
    </div>
  )
}
