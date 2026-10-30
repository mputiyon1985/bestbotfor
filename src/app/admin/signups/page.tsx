import { notFound, redirect } from 'next/navigation'
import { SignupsTable } from '@/components/signups-table'
import { requireSignupsSession } from '@/lib/signups/access'
import { combineSignups, loadAllSources } from '@/lib/signups/sources/load'
import { SOURCE_LABELS, type SourceResult } from '@/lib/signups/types'
import { overallTrend, signupTrends } from '@/lib/signups/trends'
import { SIGNUPS_EXPORT, SIGNUPS_LOGIN, SIGNUPS_LOGOUT } from '@/lib/signups/paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function overallTotal(sources: SourceResult[]): number {
  return sources.reduce((sum, source) => {
    if (!source.ok || source.total === null) return sum
    return sum + source.total
  }, 0)
}

export default async function SignupsPage() {
  const access = await requireSignupsSession()
  if (!access.configured) notFound()
  if (!access.session) redirect(SIGNUPS_LOGIN)

  const sources = await loadAllSources()
  const rows = combineSignups(sources)
  const trends = signupTrends(sources)
  const recent = overallTrend(trends)
  const anyDown = sources.some((source) => !source.ok)
  const anyCapped = sources.some((source) => source.ok && source.capped)

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Signups</h1>
        <form method="post" action={SIGNUPS_LOGOUT}>
          <input type="hidden" name="csrf" value={access.session.nonce} />
          <button type="submit" className="min-h-11 rounded-lg bg-mist px-3 font-semibold text-ink">
            Log out
          </button>
        </form>
      </header>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3" aria-label="Counts">
        {sources.map((source) => (
          <article key={source.source} className="rounded-lg border border-line bg-card px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{SOURCE_LABELS[source.source]}</h2>
            {source.ok ? (
              <>
                <p className="text-3xl font-bold">{source.total ?? source.signups.length}</p>
                {source.capped ? <p className="mt-1 text-sm text-muted">Limited to 5000 most recent</p> : null}
              </>
            ) : (
              <p className="text-3xl font-bold">Unavailable</p>
            )}
          </article>
        ))}
        <article className="rounded-lg border border-line bg-card px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Overall</h2>
          <p className="text-3xl font-bold">{overallTotal(sources)}</p>
          {anyDown ? <p className="mt-1 text-sm text-muted">Excludes unavailable sources.</p> : null}
          {anyCapped ? <p className="mt-1 text-sm text-muted">Some sources are capped at 5000.</p> : null}
        </article>
      </section>

      <section className="overflow-x-auto rounded-lg border border-line bg-card p-3" aria-label="Recent signups">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Recent</h2>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Signups in the last day, week, and 30 days</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
                Source
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
                24 hours
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
                7 days
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
                30 days
              </th>
            </tr>
          </thead>
          <tbody>
            {trends.map((trend) => (
              <tr key={trend.source}>
                <th scope="row" className="border-b border-line px-2 py-2 font-semibold">
                  {SOURCE_LABELS[trend.source]}
                </th>
                {trend.ok ? (
                  <>
                    <td className="border-b border-line px-2 py-2">{trend.day}</td>
                    <td className="border-b border-line px-2 py-2">{trend.week}</td>
                    <td className="border-b border-line px-2 py-2">{trend.month}</td>
                  </>
                ) : (
                  <td colSpan={3} className="border-b border-line px-2 py-2 text-muted">
                    Unavailable
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-2 py-2 font-semibold">
                Overall
              </th>
              <td className="px-2 py-2">{recent.day}</td>
              <td className="px-2 py-2">{recent.week}</td>
              <td className="px-2 py-2">{recent.month}</td>
            </tr>
          </tbody>
        </table>
        {recent.partial ? <p className="mt-2 text-sm text-muted">Recent totals exclude unavailable sources.</p> : null}
        {anyCapped ? <p className="mt-2 text-sm text-muted">Recent counts use the loaded rows only.</p> : null}
      </section>

      <p className="flex justify-end">
        <a href={SIGNUPS_EXPORT} className="inline-flex min-h-11 items-center rounded-lg bg-indigo px-3 font-semibold text-white">
          Export CSV
        </a>
      </p>

      <SignupsTable rows={rows} />
    </div>
  )
}
