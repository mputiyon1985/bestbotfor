import Link from 'next/link'
import { toolSeeds } from '@/data/catalog'
import { requireAdmin } from '@/lib/admin'
import { affiliateAdminRows, APPROVED_ACTIVE_AFFILIATES } from '@/lib/affiliate-admin'

export const dynamic = 'force-dynamic'

export default async function AffiliateAdminPage() {
  await requireAdmin()
  const rows = affiliateAdminRows(toolSeeds)
  return (
    <article className="max-w-3xl space-y-4">
      <p>
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="font-bold text-5xl">Affiliate programs</h1>
      <p>
        Read-only. Status and the tracking link are set in the catalog seed, one program at a time, after the owner
        approves. This page does not write the database. Approved activations: {APPROVED_ACTIVE_AFFILIATES.length}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Affiliate program status by tool</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Tool</th>
              <th scope="col" className="py-2 pr-3">Status</th>
              <th scope="col" className="py-2 pr-3">Network</th>
              <th scope="col" className="py-2">Tracking link stored</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug} className="border-b border-line">
                <th scope="row" className="py-3 pr-3 font-normal">
                  {row.name}
                  {row.prepared ? <span className="mt-1 block text-xs text-muted">Prepared</span> : null}
                </th>
                <td className="py-3 pr-3">{row.status}</td>
                <td className="py-3 pr-3">{row.network ?? 'Not named'}</td>
                <td className="py-3">{row.hasUrl ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
