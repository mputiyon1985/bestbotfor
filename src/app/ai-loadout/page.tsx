import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { NewsletterForm } from '@/components/newsletter-form'
import { bestGuideHeading } from '@/lib/descriptions'
import { loadHubRows } from '@/lib/hub-data'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { absoluteUrl } from '@/lib/site'
import { LOADOUT_DESCRIPTION, LOADOUT_HEADING, LOADOUT_PATH, LOADOUT_PDF_PATH, LOADOUT_TITLE, jobLabel } from '@/lib/seo-pages'

export const metadata: Metadata = pageMetadata({
  title: LOADOUT_TITLE,
  description: LOADOUT_DESCRIPTION,
  path: LOADOUT_PATH,
})

export default async function AiLoadoutPage() {
  const [rows, headerStore] = await Promise.all([loadHubRows(), headers()])
  const nonce = headerStore.get('x-nonce')
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'The AI Loadout', path: LOADOUT_PATH },
  ]
  const listed = rows.filter((row) => row.pick)
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: LOADOUT_HEADING,
    url: absoluteUrl(LOADOUT_PATH),
    itemListElement: listed.map((row, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: `${jobLabel(row.taskName)}: ${row.pick?.name}`,
      url: absoluteUrl(`/tools/${row.pick?.slug}`),
    })),
  }
  const caption = 'Top pick for each job'
  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemList} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{LOADOUT_HEADING}</h1>
      <p className="text-lg">
        One top pick for every job in our catalog, in one place. Picks are editorial and come from the same live ranking as each
        best-of guide, so this table updates when a ranking changes.
      </p>
      <div className="min-w-0">
        <ul aria-label={caption} className="grid gap-3 md:hidden">
          {listed.map((row) => (
            <li key={row.taskSlug} className="min-w-0 rounded-2xl border border-line p-4">
              <p className="text-sm text-muted">{jobLabel(row.taskName)}</p>
              <Link href={`/tools/${row.pick?.slug}`} className="flex min-h-11 items-center break-words font-semibold underline">
                {row.pick?.name}
              </Link>
              <p className="text-sm">
                <span className="font-semibold">Fit</span> {row.pick?.fitScore}% match
              </p>
              <p className="mt-2 break-words text-sm">{row.pick?.notes}</p>
              <Link href={`/best/${row.taskSlug}`} className="mt-2 inline-flex min-h-11 items-center text-sm underline">
                {bestGuideHeading(row.taskName)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden min-w-0 md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">Job</th>
                <th scope="col" className="py-2 pr-3">Top pick</th>
                <th scope="col" className="w-28 py-2 pr-3">Fit</th>
                <th scope="col" className="py-2 pr-3">Why</th>
                <th scope="col" className="py-2">Guide</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((row) => (
                <tr key={row.taskSlug} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-3 font-semibold">{jobLabel(row.taskName)}</th>
                  <td className="py-3 pr-3">
                    <Link href={`/tools/${row.pick?.slug}`} className="inline-flex min-h-11 items-center break-words underline">
                      {row.pick?.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-3">{row.pick?.fitScore}% match</td>
                  <td className="break-words py-3 pr-3">{row.pick?.notes}</td>
                  <td className="py-3">
                    <Link href={`/best/${row.taskSlug}`} className="inline-flex min-h-11 items-center break-words underline">
                      {bestGuideHeading(row.taskName)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <section aria-labelledby="loadout-pdf" className="rounded-3xl border border-line bg-card px-4 py-6 md:px-6">
        <h2 id="loadout-pdf" className="font-semibold text-3xl">Get the PDF + The Daily Bot</h2>
        <p className="mt-2 max-w-xl text-muted">
          The one-page PDF is free to download below, no signup needed. The Daily Bot is a free weekday note on AI tools. If you
          subscribe, we store your email. Unsubscribe anytime.
        </p>
        <div className="mt-4 max-w-xl">
          <NewsletterForm source="ai-loadout" />
        </div>
        <p className="mt-4">
          <a href={LOADOUT_PDF_PATH} className="inline-flex min-h-11 items-center font-semibold underline">
            Download the AI Loadout (PDF)
          </a>
        </p>
        <p className="text-sm text-muted">The PDF is a dated snapshot. The table above is always current.</p>
      </section>
      <p>
        Not sure which job is yours? <Link className="underline" href="/">Answer 3 questions</Link> and get your pick in 30 seconds.
      </p>
      <p className="text-sm text-muted">
        Payment never buys a higher rank. <Link className="underline" href="/newsletter">More about The Daily Bot</Link>.
      </p>
    </article>
  )
}
