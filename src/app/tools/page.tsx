import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { listToolPage } from '@/lib/catalog'
import { pageMetadata } from '@/lib/metadata'
import { firstString } from '@/lib/validation'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const params = await searchParams
  const page = pageNumber(firstString(params.page))
  return pageMetadata({
    title: page > 1 ? `Tools, page ${page}` : 'Tools',
    description: 'Every AI tool in the BestBotFor catalog, one page at a time.',
    path: page > 1 ? `/tools?page=${page}` : '/tools',
  })
}

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const listing = await listToolPage(pageNumber(firstString(params.page)))

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Tools', path: '/tools' }]} />
      <h1 className="font-bold text-5xl">Tools</h1>
      <p className="text-muted">
        {listing.total} tools. Page {listing.page} of {listing.pageCount}.
      </p>
      {listing.tools.length === 0 ? <p>No tools are in the catalog yet.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {listing.tools.map((tool) => (
          <li key={tool.slug} className="rounded-2xl border border-line px-4 py-3">
            <Link href={`/tools/${tool.slug}`} className="font-semibold underline-offset-4 hover:underline">
              {tool.name}
            </Link>
            <span className="mt-1 block text-sm text-muted">
              {tool.category}. {tool.shortDesc}
            </span>
          </li>
        ))}
      </ul>
      <nav aria-label="Pages" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        {listing.page > 1 ? (
          <Link className="underline" href={listing.page === 2 ? '/tools' : `/tools?page=${listing.page - 1}`}>
            Previous page
          </Link>
        ) : null}
        {listing.page < listing.pageCount ? (
          <Link className="underline" href={`/tools?page=${listing.page + 1}`}>
            Next page
          </Link>
        ) : null}
      </nav>
    </div>
  )
}

function pageNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return parsed
}
