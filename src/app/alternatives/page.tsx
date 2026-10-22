import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { toolSeeds } from '@/data/catalog'
import { ALTERNATIVE_PAGES, alternativesHeading, alternativesPath } from '@/lib/alternatives'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { absoluteUrl } from '@/lib/site'

const ALTERNATIVES_INDEX_PATH = '/alternatives'
const HEADING = 'AI tool alternatives'

export const metadata: Metadata = pageMetadata({
  title: 'AI Tool Alternatives',
  description: 'Alternatives to popular AI tools, ranked by fit for the same job and filtered by budget. Free options included.',
  path: ALTERNATIVES_INDEX_PATH,
})

function entries() {
  return ALTERNATIVE_PAGES.flatMap((page) => {
    const tool = toolSeeds.find((item) => item.slug === page.tool)
    return tool ? [{ path: alternativesPath(page.tool), title: alternativesHeading(tool.name) }] : []
  })
}

export default async function AlternativesIndexPage() {
  const nonce = (await headers()).get('x-nonce')
  const list = entries()
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Alternatives', path: ALTERNATIVES_INDEX_PATH },
  ]
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: HEADING,
    url: absoluteUrl(ALTERNATIVES_INDEX_PATH),
    itemListElement: list.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.title,
      url: absoluteUrl(entry.path),
    })),
  }
  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemList} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{HEADING}</h1>
      <p className="text-lg">Other tools that do the same job, ranked by fit and filtered by budget. Payment never buys a higher rank.</p>
      <ul aria-label="Alternatives" className="grid gap-3 md:grid-cols-2">
        {list.map((entry) => (
          <li key={entry.path} className="min-w-0 rounded-2xl border border-line p-4">
            <Link href={entry.path} className="flex min-h-11 items-center break-words font-semibold underline">
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  )
}
