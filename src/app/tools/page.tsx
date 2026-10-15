import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { getCatalog } from '@/lib/catalog'
import { priceLabel } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { toolsIndexModel, toolsIndexPath, type ToolCategory } from '@/lib/tool-index'
import { firstString } from '@/lib/validation'

type SearchParams = Record<string, string | string[] | undefined>

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const params = await searchParams
  const catalog = await getCatalog()
  const model = toolsIndexModel(catalog.tools, firstString(params.category))
  return pageMetadata({
    title: model.title,
    description: model.description,
    path: model.path,
    noIndex: model.noIndex,
  })
}

export default async function ToolsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const catalog = await getCatalog()
  const model = toolsIndexModel(catalog.tools, firstString(params.category))
  const nonce = (await headers()).get('x-nonce')
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Tools', path: '/tools' },
    ...(model.selected ? [{ name: model.selected.name, path: model.path }] : []),
  ]
  const shown = model.tools.length
  const total = catalog.tools.length

  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      {model.unknown ? null : <JsonLd data={itemListJsonLd(model.itemListName, model.path, model.tools)} nonce={nonce} />}
      <Breadcrumbs items={crumbs} />
      <header className="space-y-3">
        <h1 className="font-bold text-5xl leading-tight">{model.heading}</h1>
        <p className="max-w-2xl text-lg">{model.description}</p>
        <p className="text-sm text-muted">
          {model.unknown
            ? 'That category is not in the catalog.'
            : `Showing ${shown} of ${total} ${total === 1 ? 'tool' : 'tools'}.`}
        </p>
      </header>
      <nav aria-label="Filter by category">
        <ul className="flex flex-wrap gap-2">
          <li>
            <CategoryLink category={null} current={!model.selected && !model.unknown} count={total} />
          </li>
          {model.categories.map((category) => (
            <li key={category.slug}>
              <CategoryLink category={category} current={model.selected?.slug === category.slug} count={category.count} />
            </li>
          ))}
        </ul>
      </nav>
      {model.tools.length === 0 ? (
        <p>{model.unknown ? 'Choose a category above to see the tools in the catalog.' : 'No tools are in the catalog yet.'}</p>
      ) : (
        <ul aria-label="Tools" className="space-y-3">
          {model.tools.map((tool) => (
            <li key={tool.slug} className="rounded-2xl border border-line bg-card px-4 py-4">
              <h2 className="font-semibold text-2xl">
                <Link href={`/tools/${tool.slug}`} className="underline decoration-line underline-offset-4 hover:decoration-accent">
                  {tool.name}
                </Link>
              </h2>
              <p className="text-sm text-muted">{tool.vendor}</p>
              <p className="mt-2 max-w-2xl">{tool.shortDesc}</p>
              <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt className="inline font-semibold">Category </dt>
                  <dd className="inline">{tool.category}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Price </dt>
                  <dd className="inline">{priceLabel(tool)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </article>
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
      href={category ? toolsIndexPath(category) : '/tools'}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-semibold ${
        current ? 'border-indigo bg-indigo text-white' : 'border-line bg-card hover:border-accent'
      }`}
    >
      {name}
      <span className="sr-only">{`, ${label}`}</span>
      <span aria-hidden="true" className="font-normal">{` (${count})`}</span>
    </Link>
  )
}
