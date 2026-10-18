import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { bestGuideHeading } from '@/lib/descriptions'
import { loadHubRows } from '@/lib/hub-data'
import { absoluteUrl } from '@/lib/site'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { guidePath } from '@/content/guides'
import {
  BEST_HUB_DESCRIPTION,
  BEST_HUB_HEADING,
  BEST_HUB_PATH,
  BEST_HUB_TITLE,
  CATALOG_TOOL_COUNT,
  LOADOUT_PATH,
  jobLabel,
} from '@/lib/seo-pages'

export const metadata: Metadata = pageMetadata({
  title: BEST_HUB_TITLE,
  description: BEST_HUB_DESCRIPTION,
  path: BEST_HUB_PATH,
})

export default async function BestHubPage() {
  const [rows, headerStore] = await Promise.all([loadHubRows(), headers()])
  const nonce = headerStore.get('x-nonce')
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Best by job', path: BEST_HUB_PATH },
  ]
  const listed = rows.filter((row) => row.pick)
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: BEST_HUB_HEADING,
    url: absoluteUrl(BEST_HUB_PATH),
    itemListElement: listed.map((row, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: bestGuideHeading(row.taskName),
      url: absoluteUrl(`/best/${row.taskSlug}`),
    })),
  }
  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemList} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{BEST_HUB_HEADING}</h1>
      <p className="text-lg">
        One top pick for each job, chosen from {CATALOG_TOOL_COUNT} tools, with the closest alternatives on each page. Picks are editorial.
        Payment never buys a higher rank.
      </p>
      <ul aria-label="Jobs" className="grid gap-3 md:grid-cols-2">
        {listed.map((row) => (
          <li key={row.taskSlug} className="min-w-0 rounded-2xl border border-line p-4">
            <Link href={`/best/${row.taskSlug}`} className="flex min-h-11 items-center break-words font-semibold underline">
              {bestGuideHeading(row.taskName)}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {jobLabel(row.taskName)}: {row.pick?.name}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        <Link className="underline" href={LOADOUT_PATH}>Get the AI Loadout</Link>, every pick on one page.{' '}
        <Link className="underline" href={guidePath('how-to-choose-an-ai-tool')}>New to this? How to choose an AI tool</Link>.
      </p>
      <p className="text-sm text-muted">
        Want this personalized? <Link className="underline" href="/">Get your own pick in 30 seconds</Link>: answer three questions.
      </p>
    </article>
  )
}
