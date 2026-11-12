import { notFound, redirect } from 'next/navigation'
import { requireLeadsSession } from '@/lib/leads/access'
import { getDb } from '@/lib/db'
import {
  LEAD_SORTS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  emptyLeadQuery,
  filterLeads,
  formatClosedUsd,
  leadSummary,
  leadsPageHref,
  parseLeadQuery,
  sortLeads,
  toggleSort,
  type LeadQuery,
  type LeadRow,
  type LeadSort,
  type LeadSummary,
} from '@/lib/leads/model'
import { listLeads } from '@/lib/leads/store'
import { LEADS_HOME, LEADS_LOGIN, LEADS_LOGOUT } from '@/lib/leads/paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COLUMN_SORTS = LEAD_SORTS.filter((sort): sort is Exclude<LeadSort, 'warm'> => sort !== 'warm')

const SORT_LABELS: Record<Exclude<LeadSort, 'warm'>, string> = {
  company: 'Company',
  email: 'Email',
  type: 'Type',
  status: 'Status',
  first: 'First contact',
  last: 'Last touch',
  touches: 'Touches',
  next: 'Next date',
  amount: 'Amount',
}

function SummaryCards({ summary }: { summary: LeadSummary }) {
  const cards = [
    ['Contacted', String(summary.contacted)],
    ['Replied', String(summary.replied)],
    ['Affiliate approvals', String(summary.affiliateApprovals)],
    ['Declines', String(summary.declines)],
    ['Bounces', String(summary.bounces)],
    ['$ closed', formatClosedUsd(summary.closedUsd)],
  ] as const
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3" aria-label="Counts">
      {cards.map(([label, value]) => (
        <article key={label} className="rounded-lg border border-line bg-card px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{label}</h2>
          <p className="text-3xl font-bold">{value}</p>
          {label === '$ closed' ? <p className="mt-1 text-sm text-muted">{summary.closedCount} leads</p> : null}
        </article>
      ))}
    </section>
  )
}

function SortHeader({ query, sort }: { query: LeadQuery; sort: Exclude<LeadSort, 'warm'> }) {
  const next = toggleSort(query, sort)
  const active = query.sort === sort
  const mark = !active ? '' : query.dir === 'desc' ? ' ↓' : ' ↑'
  return (
    <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
      <a href={leadsPageHref(next)} className="inline-flex min-h-11 items-center">
        {SORT_LABELS[sort]}
        {mark}
      </a>
    </th>
  )
}

function cell(value: string | null): string {
  return value && value.length > 0 ? value : '—'
}

function LeadTable({ rows, query }: { rows: readonly LeadRow[]; query: LeadQuery }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Leads. Warm leads are first unless another column is selected.</caption>
        <thead>
          <tr>
            {COLUMN_SORTS.map((sort) => (
              <SortHeader key={sort} query={query} sort={sort} />
            ))}
            <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
              Next step
            </th>
            <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold text-muted">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMN_SORTS.length + 2} className="px-2 py-3 text-muted">
                No leads match.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-line px-2 py-2">{row.company}</td>
                <td className="border-b border-line px-2 py-2 break-all">{row.contactEmail}</td>
                <td className="border-b border-line px-2 py-2">{row.type}</td>
                <td className="border-b border-line px-2 py-2">{LEAD_STATUS_LABELS[row.status]}</td>
                <td className="border-b border-line px-2 py-2">{cell(row.firstContact)}</td>
                <td className="border-b border-line px-2 py-2">{cell(row.lastTouch)}</td>
                <td className="border-b border-line px-2 py-2">{row.touches}</td>
                <td className="border-b border-line px-2 py-2">{cell(row.nextDate)}</td>
                <td className="border-b border-line px-2 py-2">{row.amountClosedUsd === null ? '—' : formatClosedUsd(row.amountClosedUsd)}</td>
                <td className="border-b border-line px-2 py-2">{cell(row.nextStep)}</td>
                <td className="border-b border-line px-2 py-2 whitespace-pre-wrap">{cell(row.notes)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireLeadsSession()
  if (!access.configured) notFound()
  if (!access.session) redirect(LEADS_LOGIN)

  const query = parseLeadQuery(await searchParams)
  let rows: LeadRow[] = []
  let unavailable = false
  try {
    rows = await listLeads(getDb())
  } catch (error) {
    console.error('leads list failed', error instanceof Error ? error.name : 'error')
    unavailable = true
  }
  const summary = leadSummary(rows)
  const shown = sortLeads(filterLeads(rows, query), query)
  const clear = emptyLeadQuery()

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Leads</h1>
        <form method="post" action={LEADS_LOGOUT}>
          <input type="hidden" name="csrf" value={access.session.nonce} />
          <button type="submit" className="min-h-11 rounded-lg bg-mist px-3 font-semibold text-ink">
            Log out
          </button>
        </form>
      </header>
      <p className="text-sm text-muted">
        Counts are the leads in that status now. Affiliate approvals are status affiliate_approved. $ closed adds amount_closed_usd for status closed, and a blank amount counts as $0. Warm leads come first: replied, then affiliate approvals, then contacted.
      </p>
      {unavailable ? <p className="text-danger">Leads are unavailable.</p> : <SummaryCards summary={summary} />}
      <form method="get" action={LEADS_HOME} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Status
          <select name="status" defaultValue={query.status} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink">
            <option value="">All</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Type
          <input name="type" defaultValue={query.type} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Company or email
          <input name="q" defaultValue={query.q} className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink" />
        </label>
        {query.sort !== 'warm' ? <input type="hidden" name="sort" value={query.sort} /> : null}
        {query.dir !== 'asc' ? <input type="hidden" name="dir" value={query.dir} /> : null}
        <button type="submit" className="min-h-11 rounded-lg bg-indigo px-3 font-semibold text-white">
          Filter
        </button>
        <a href={leadsPageHref({ ...query, sort: 'warm', dir: 'asc' })} className="inline-flex min-h-11 items-center rounded-lg bg-mist px-3 font-semibold text-ink">
          Warm first
        </a>
        <a href={leadsPageHref(clear)} className="inline-flex min-h-11 items-center rounded-lg bg-mist px-3 font-semibold text-ink">
          Clear
        </a>
      </form>
      {unavailable ? null : <LeadTable rows={shown} query={query} />}
    </div>
  )
}
