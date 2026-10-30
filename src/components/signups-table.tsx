'use client'

import { useMemo, useState } from 'react'
import { formatUtc } from '@/lib/signups/format'
import { filterSignups, type SourceFilter } from '@/lib/signups/filter'
import { SOURCE_IDS, SOURCE_LABELS, type Signup } from '@/lib/signups/types'

export function SignupsTable({ rows }: { rows: Signup[] }) {
  const [source, setSource] = useState<SourceFilter>('all')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => filterSignups(rows, source, query), [rows, source, query])

  return (
    <section className="rounded-lg border border-line bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as SourceFilter)}
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink"
          >
            <option value="all">All sources</option>
            {SOURCE_IDS.map((id) => (
              <option key={id} value={id}>
                {SOURCE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by email"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 rounded-lg border border-line bg-paper px-3 text-ink"
          />
        </label>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {filtered.length} shown
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Combined signups, newest first</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Source
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Email
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3">
                  No signups to show.
                </td>
              </tr>
            ) : (
              filtered.map((row, index) => (
                <tr key={`${row.source}:${row.createdAt}:${index}`}>
                  <td className="border-b border-line px-2 py-2 align-top">{SOURCE_LABELS[row.source]}</td>
                  <td className="border-b border-line px-2 py-2 align-top break-all">{row.email}</td>
                  <td className="border-b border-line px-2 py-2 align-top whitespace-nowrap">{formatUtc(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
