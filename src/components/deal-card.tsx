import Link from 'next/link'
import type { DealView } from '@/lib/deals-view'
import { formatUsDate } from '@/lib/format'

/**
 * Server component. A locked view has no code or link in its data, so the
 * blurred box below is a placeholder, not the real code.
 */
export function DealCard({ deal }: { deal: DealView }) {
  return (
    <div className="rounded-2xl border border-line p-4" data-deal={deal.id} data-deal-locked={deal.locked ? 'true' : 'false'}>
      <p className="text-sm text-muted">{deal.vendor}</p>
      <h3 className="font-semibold">{deal.title}</h3>
      {deal.locked ? (
        <>
          <p className="mt-1">Members get {deal.discountText}.</p>
          <p className="mt-2 flex items-center gap-3">
            <span aria-hidden="true" className="select-none rounded-lg border border-line px-3 py-1 font-mono blur-sm">
              MEMBERS
            </span>
            <Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold underline">
              Become a member to unlock
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="mt-1">{deal.discountText}</p>
          {deal.code ? (
            <p className="mt-2">
              Code: <code className="rounded-lg border border-line px-2 py-1 font-mono">{deal.code}</code>
            </p>
          ) : null}
          {deal.dealUrl ? (
            <p className="mt-2">
              <a href={deal.dealUrl} rel="nofollow noopener" className="inline-flex min-h-11 items-center font-semibold underline">
                Get the deal
              </a>
            </p>
          ) : null}
          {deal.terms ? <p className="mt-2 text-sm text-muted">{deal.terms}</p> : null}
        </>
      )}
      {deal.expiresAt ? <p className="mt-2 text-sm text-muted">Ends {formatUsDate(new Date(deal.expiresAt).toISOString().slice(0, 10))}.</p> : null}
    </div>
  )
}

export function DealList({ deals }: { deals: DealView[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {deals.map((deal) => (
        <li key={deal.id}>
          <DealCard deal={deal} />
        </li>
      ))}
    </ul>
  )
}
