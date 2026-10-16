import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ToolLogo } from '@/components/tool-logo'
import { listToolCategoryCounts, listToolPage } from '@/lib/catalog'
import { pageMetadata } from '@/lib/metadata'
import { categorySlug, type ToolCategory } from '@/lib/tool-index'
import { isToolsPageInRange, parseToolsPage } from '@/lib/tools-page'
import { firstString } from '@/lib/validation'

const MAX_CATEGORY_QUERY = 80
const INDEX_DESCRIPTION = 'Every AI tool in the BestBotFor catalog with price, free tier and skill level. Not sure which one? Get the right AI in 30 seconds.'

type SearchParams = Record<string, string | string[] | undefined>

type ResolvedCategory = {
  categories: ToolCategory[]
  selected: ToolCategory | null
  unknown: boolean
  total: number
}

function toolsPath(category: string | null, page: number): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/tools?${query}` : '/tools'
}

async function resolveCategory(raw: string): Promise<ResolvedCategory> {
  const counts = await listToolCategoryCounts()
  const categories = counts
    .map((row) => ({ name: row.category.trim(), slug: categorySlug(row.category), count: row.total }))
    .filter((row) => row.slug)
    .sort((a, b) => a.name.localeCompare(b.name))
  const total = categories.reduce((sum, row) => sum + row.count, 0)
  const trimmed = raw.trim()
  if (!trimmed) return { categories, selected: null, unknown: false, total }
  if (trimmed.length > MAX_CATEGORY_QUERY) return { categories, selected: null, unknown: true, total }
  const slug = categorySlug(trimmed)
  const selected =
    categories.find((category) => category.slug === slug || category.name.toLowerCase() === trimmed.toLowerCase()) ??
    null
  return { categories, selected, unknown: !selected, total }
}

async function loadToolsIndex(params: SearchParams) {
  const requested = parseToolsPage(firstString(params.page))
  if (requested === null) notFound()
  const resolved = await resolveCategory(firstString(params.category))
  if (resolved.unknown) return { requested, resolved, listing: null }
  const listing = await listToolPage(requested, resolved.selected?.name ?? null)
  if (!isToolsPageInRange(requested, listing.pageCount)) notFound()
  return { requested, resolved, listing }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const loaded = await loadToolsIndex(await searchParams)
  const { resolved, listing } = loaded
  if (resolved.unknown || !listing) {
    return pageMetadata({
      title: 'Tools',
      description: INDEX_DESCRIPTION,
      path: '/tools',
      noIndex: true,
    })
  }
  const category = resolved.selected
  const page = listing.page
  const title = category
    ? page > 1
      ? `${category.name} tools, page ${page}`
      : `${category.name} tools`
    : page > 1
      ? `Tools, page ${page}`
      : 'Tools'
  const description = category
    ? `${category.name} tools in the BestBotFor catalog, one page at a time.`
    : INDEX_DESCRIPTION
  return pageMetadata({
    title,
    description,
    path: toolsPath(category?.slug ?? null, page),
  })
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { resolved, listing } = await loadToolsIndex(await searchParams)
  const selected = resolved.selected

  return (
    <div className="space-y-8">
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Tools', path: '/tools' },
          ...(selected ? [{ name: selected.name, path: toolsPath(selected.slug, 1) }] : []),
        ]}
      />
      <header className="space-y-3">
        <h1 className="font-bold text-5xl">Tools</h1>
        <p className="text-muted">
          {resolved.unknown
            ? 'That category is not in the catalog.'
            : listing
              ? `${listing.total} ${selected ? `${selected.name} ` : ''}${listing.total === 1 ? 'tool' : 'tools'}. Page ${listing.page} of ${listing.pageCount}.`
              : 'No tools are in the catalog yet.'}
        </p>
      </header>
      <nav
        aria-label="Filter by category"
        className="min-w-0 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:overscroll-x-contain max-md:px-2 max-md:py-2"
      >
        <ul className="flex flex-wrap gap-2 max-md:w-max max-md:flex-nowrap">
          <li className="max-md:shrink-0">
            <CategoryLink category={null} current={!selected && !resolved.unknown} count={resolved.total} />
          </li>
          {resolved.categories.map((category) => (
            <li key={category.slug} className="max-md:shrink-0">
              <CategoryLink category={category} current={selected?.slug === category.slug} count={category.count} />
            </li>
          ))}
        </ul>
      </nav>
      {listing && listing.tools.length === 0 ? <p>No tools are in the catalog yet.</p> : null}
      {listing && listing.tools.length > 0 ? (
        <ul aria-label="Tools" className="grid gap-3 sm:grid-cols-2">
          {listing.tools.map((tool) => (
            <li key={tool.slug} className="flex min-w-0 items-start gap-3 rounded-2xl border border-line px-4 py-3">
              <ToolLogo name={tool.name} slug={tool.slug} />
              <div className="min-w-0">
                <Link href={`/tools/${tool.slug}`} className="font-semibold underline-offset-4 hover:underline">
                  {tool.name}
                </Link>
                <span className="mt-1 block text-sm text-muted">
                  {tool.category}. {tool.shortDesc}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {listing ? (
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
          {listing.page > 1 ? (
            <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-4 hover:border-accent" href={toolsPath(selected?.slug ?? null, listing.page - 1)}>
              Previous page
            </Link>
          ) : null}
          {listing.page < listing.pageCount ? (
            <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-4 hover:border-accent" href={toolsPath(selected?.slug ?? null, listing.page + 1)}>
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}

function CategoryLink({
  category,
  current,
  count,
}: {
  category: ToolCategory | null
  current: boolean
  count: number
}) {
  const name = category?.name ?? 'All'
  const label = `${count} ${count === 1 ? 'tool' : 'tools'}`
  return (
    <Link
      href={category ? toolsPath(category.slug, 1) : '/tools'}
      aria-current={current ? 'page' : undefined}
      className={`relative inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-semibold max-md:scroll-mx-3 max-md:whitespace-nowrap ${
        current ? 'border-indigo bg-indigo text-white' : 'border-line bg-card hover:border-accent'
      }`}
    >
      {name}
      <span className="sr-only">{`, ${label}`}</span>
      <span aria-hidden="true" className="font-normal">{` (${count})`}</span>
    </Link>
  )
}
