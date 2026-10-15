import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { getCatalog } from '@/lib/catalog'
import { comparisonRows, comparisonSummary } from '@/lib/compare'
import { deepDive } from '@/lib/deep-dive'
import { priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/jsonld'
import { memberAccess } from '@/lib/members'
import { pageMetadata } from '@/lib/metadata'
import { parseComparePair } from '@/lib/validation'

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }): Promise<Metadata> {
  const { pair } = await params
  const parsed = parseComparePair(pair)
  if (!parsed) return pageMetadata({ title: 'Comparison', description: 'That comparison is not available.', path: `/compare/${pair}`, noIndex: true })
  const catalog = await getCatalog()
  const a = catalog.tools.find((tool) => tool.slug === parsed.a)
  const b = catalog.tools.find((tool) => tool.slug === parsed.b)
  if (!a || !b) return pageMetadata({ title: 'Comparison', description: 'That comparison is not available.', path: `/compare/${pair}`, noIndex: true })
  return pageMetadata({
    title: `${a.name} vs ${b.name}`,
    description: `${a.name} vs ${b.name}: which AI tool fits the job, in one line, with a side-by-side table.`,
    path: `/compare/${a.slug}-vs-${b.slug}`,
    imagePath: `/api/og?kind=compare&pair=${a.slug}-vs-${b.slug}`,
  })
}

export default async function ComparePage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params
  const parsed = parseComparePair(pair)
  if (!parsed) notFound()
  const catalog = await getCatalog()
  const a = catalog.tools.find((tool) => tool.slug === parsed.a)
  const b = catalog.tools.find((tool) => tool.slug === parsed.b)
  if (!a || !b) notFound()
  const rows = comparisonRows(a, b)
  const summary = comparisonSummary(a, b, rows)
  const nonce = (await headers()).get('x-nonce')
  const access = await memberAccess()
  const path = `/compare/${a.slug}-vs-${b.slug}`
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: `${a.name} vs ${b.name}`, path },
  ]
  const faqs = [
    { question: `Which is better, ${a.name} or ${b.name}?`, answer: summary },
    {
      question: 'What do they cost?',
      answer: `${a.name}: ${priceLabel(a)}. ${b.name}: ${priceLabel(b)}. Confirm the current price on each site.`,
    },
  ]
  const notes = access.allowed ? deepDive(a, b) : null

  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-serif text-5xl leading-tight">{a.name} vs {b.name}</h1>
      <p className="text-lg">{summary}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">{a.name} compared with {b.name}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Job</th>
              <th scope="col" className="py-2 pr-3">{a.name}</th>
              <th scope="col" className="py-2">{b.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <th scope="row" className="py-3 pr-3">Price</th>
              <td className="py-3 pr-3">{priceLabel(a)}</td>
              <td className="py-3">{priceLabel(b)}</td>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className="py-3 pr-3">Experience</th>
              <td className="py-3 pr-3">{skillLabel[a.skillLevel]}</td>
              <td className="py-3">{skillLabel[b.skillLevel]}</td>
            </tr>
            {rows.map((row) => (
              <tr key={row.taskName} className="border-b border-line align-top">
                <th scope="row" className="py-3 pr-3">{row.taskName}</th>
                <td className="py-3 pr-3">{row.aScore ?? '—'}</td>
                <td className="py-3">{row.bScore ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        <Link className="underline" href={`/tools/${a.slug}`}>{a.name} profile</Link>
        {' · '}
        <Link className="underline" href={`/tools/${b.slug}`}>{b.name} profile</Link>
      </p>
      {notes ? (
        <section className="rounded-3xl bg-moss p-6">
          <h2 className="font-serif text-3xl">{notes.heading}</h2>
          {notes.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="mt-3">{paragraph}</p>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-line p-6">
          <h2 className="font-serif text-3xl">Members’ deep dive</h2>
          <p className="mt-2 text-muted">
            Members get a longer note on price, skill fit, and when to switch. The note is not on this page until you have an active membership.
          </p>
          <Link href="/pricing" className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
            See membership
          </Link>
        </section>
      )}
    </article>
  )
}
