import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { compareIndexEntries, COMPARE_INDEX_HEADING, COMPARE_INDEX_PATH } from '@/lib/compare-index'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Compare AI tools',
  description: 'Side-by-side comparisons of popular AI tools: price, free tier, skill level and what each one is for.',
  path: COMPARE_INDEX_PATH,
})

export default async function CompareIndexPage() {
  const nonce = (await headers()).get('x-nonce')
  const entries = compareIndexEntries()
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Compare', path: COMPARE_INDEX_PATH },
  ]
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: COMPARE_INDEX_HEADING,
    url: absoluteUrl(COMPARE_INDEX_PATH),
    itemListElement: entries.map((entry, index) => ({
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
      <h1 className="font-bold text-5xl leading-tight">{COMPARE_INDEX_HEADING}</h1>
      <p className="text-lg">Two tools side by side: price, free tier, skill level and what each one is for.</p>
      <ul aria-label="Comparisons" className="grid gap-3 md:grid-cols-2">
        {entries.map((entry) => (
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
