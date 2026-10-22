import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ToolLogo } from '@/components/tool-logo'
import { searchCatalog } from '@/lib/catalog'
import { pageMetadata } from '@/lib/metadata'
import { searchQuerySchema } from '@/lib/validation'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q : ''
  const path = query ? `/search?q=${encodeURIComponent(query)}` : '/search'
  return pageMetadata({
    title: query ? `Search: ${query.slice(0, 80)}` : 'Search tools',
    description: 'Search the BestBotFor catalog by tool name, vendor, or job. Or answer three questions and get the right AI in 30 seconds.',
    path,
    noIndex: true,
    canonical: false,
  })
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = typeof params.q === 'string' ? params.q : ''
  const parsed = searchQuerySchema.safeParse(raw)
  const results = parsed.success ? await searchCatalog(parsed.data) : []

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Search', path: '/search' }]} />
      <h1 className="font-bold text-5xl">Search tools</h1>
      <form action="/search" method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          Search tools
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={parsed.success ? parsed.data : ''}
          maxLength={80}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3"
        />
        <button type="submit" className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
          Search
        </button>
      </form>
      {!parsed.success ? <p className="text-muted">Enter a tool, vendor, or job.</p> : null}
      {parsed.success && results.length === 0 ? <p>No tools matched that search.</p> : null}
      <ul className="space-y-3">
        {results.map((tool) => (
          <li key={tool.slug} className="flex min-w-0 items-start gap-3">
            <ToolLogo name={tool.name} slug={tool.slug} />
            <div className="min-w-0">
              <Link href={`/tools/${tool.slug}`} className="font-semibold underline">
                {tool.name}
              </Link>
              <span className="text-muted"> — {tool.shortDesc}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
