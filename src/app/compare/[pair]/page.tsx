import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { CompareNewsletter, Inline } from '@/components/compare-newsletter'
import { DailyBotCapture } from '@/components/daily-bot-capture'
import { NewsletterCta } from '@/components/newsletter-cta'
import { newsletterCtaEnabled } from '@/lib/flags'
import { JsonLd } from '@/components/json-ld'
import { ToolLogo } from '@/components/tool-logo'
import { reversedCuratedComparePath } from '@/data/compare-copy'
import { getToolsBySlugs } from '@/lib/catalog'
import type { CatalogTool } from '@/lib/catalog-types'
import { comparisonRows, comparisonSummary } from '@/lib/compare'
import { compareCostAnswer, compareFaqs, compareView, type CompareView } from '@/lib/compare-copy'
import { deepDive } from '@/lib/deep-dive'
import { priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { memberAccess } from '@/lib/members'
import { compareDescription } from '@/lib/descriptions'
import { pageMetadata } from '@/lib/metadata'
import { scoresPublished } from '@/lib/score-visibility'
import { parseComparePair } from '@/lib/validation'
import { novaCopy } from '@/content/nova-comparisons'
import { GuideMarkdown } from '@/components/guide-markdown'

export async function generateMetadata({ params }: { params: Promise<{ pair: string }> }): Promise<Metadata> {
  const { pair } = await params
  const parsed = parseComparePair(pair)
  // Missing pairs call notFound() so their noindex metadata is not hydrated as a second robots meta.
  if (!parsed) notFound()
  redirectReversedCuratedPair(parsed)
  const [a, b] = await orderedPair(parsed.a, parsed.b)
  if (!a || !b) notFound()
  const view = compareView(a, b, { showScores: scoresPublished() })
  return pageMetadata({
    title: view?.metaTitle ?? `${a.name} vs ${b.name}`,
    description: view?.metaDescription ?? compareDescription(a.name, b.name),
    path: `/compare/${a.slug}-vs-${b.slug}`,
    imagePath: `/api/og?kind=compare&pair=${a.slug}-vs-${b.slug}`,
  })
}

export default async function ComparePage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params
  const parsed = parseComparePair(pair)
  if (!parsed) notFound()
  redirectReversedCuratedPair(parsed)
  const [a, b] = await orderedPair(parsed.a, parsed.b)
  if (!a || !b) notFound()
  const rows = comparisonRows(a, b)
  const view = compareView(a, b, { showScores: scoresPublished() })
  const summary = view?.verdictPlain ?? comparisonSummary(a, b, rows)
  const nonce = (await headers()).get('x-nonce')
  const access = await memberAccess()
  const path = `/compare/${a.slug}-vs-${b.slug}`
  const heading = view?.heading ?? `${a.name} vs ${b.name}`
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: heading, path },
  ]
  const faqs = compareFaqs({
    nameA: view?.nameA ?? a.name,
    nameB: view?.nameB ?? b.name,
    verdict: summary,
    cost: compareCostAnswer(view, {
      nameA: a.name,
      priceA: priceLabel(a),
      nameB: b.name,
      priceB: priceLabel(b),
    }),
  })
  const notes = access.allowed ? deepDive(a, b) : null
  const nova = novaCopy(`${a.slug}-vs-${b.slug}`)
  // Flag on: the CTA replaces the page's other Daily Bot forms, so there is one inline signup.
  const cta = newsletterCtaEnabled()

  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(heading, path, [a, b])} nonce={nonce} />
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <div className="flex min-w-0 items-center gap-3">
        <ToolLogo name={a.name} slug={a.slug} />
        <ToolLogo name={b.name} slug={b.slug} />
        <h1 className="min-w-0 font-bold text-5xl leading-tight">{heading}</h1>
      </div>
      {view ? (
        <CuratedBody view={view} ctaPath={cta ? path : null} />
      ) : (
        <>
          <p className="text-lg">{summary}</p>
          {cta ? <NewsletterCta path={path} source="compare" /> : null}
          <AutoTable a={a} b={b} rows={rows} />
          <p className="text-sm">
            <Link className="underline" href={`/tools/${a.slug}`}>{a.name} profile</Link>
            {' · '}
            <Link className="underline" href={`/tools/${b.slug}`}>{b.name} profile</Link>
          </p>
        </>
      )}
      {notes ? (
        <section className="rounded-3xl bg-mist p-6">
          <h2 className="font-semibold text-3xl">{notes.heading}</h2>
          {notes.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="mt-3">{paragraph}</p>
          ))}
        </section>
      ) : (
        <section className="rounded-3xl border border-line p-6">
          <h2 className="font-semibold text-3xl">Members’ deep dive</h2>
          <p className="mt-2 text-muted">
            Members get a longer note on price, skill fit, and when to switch. The note is not on this page until you have an active membership.
          </p>
          <Link href="/pricing" className="mt-4 inline-flex min-h-12 items-center font-semibold underline">
            See membership
          </Link>
        </section>
      )}
      {cta ? null : view ? (
        <CompareNewsletter idSuffix="end" cta={view.cta} label="The Daily Bot at the end of the page" />
      ) : (
        <DailyBotCapture source="compare" />
      )}
      {nova ? <GuideMarkdown markdown={nova} /> : null}
    </article>
  )
}

function CuratedBody({ view, ctaPath }: { view: CompareView; ctaPath: string | null }) {
  return (
    <>
      <p className="text-lg">
        <Inline text={view.verdict} />
      </p>
      <p className="text-sm text-muted italic">{view.checkedLine}</p>
      {ctaPath ? <NewsletterCta path={ctaPath} source="compare" /> : null}
      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="font-semibold text-3xl">{view.pickAHeading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {view.pickA.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-semibold text-3xl">{view.pickBHeading}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {view.pickB.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
      <CuratedTable view={view} />
      {view.secondaryNote ? <p className="text-sm text-muted">{view.secondaryNote}</p> : null}
      {ctaPath ? null : <CompareNewsletter idSuffix="after-table" cta={view.cta} label="The Daily Bot after the table" />}
      <p className="text-sm">
        <Link className="underline" href="/">find the right AI in 30 seconds</Link>
      </p>
      <p className="text-sm">
        <Link className="underline" href={`/tools/${pairSide(view.slug, 'a')}`}>{view.nameA} profile</Link>
        {' · '}
        <Link className="underline" href={`/tools/${pairSide(view.slug, 'b')}`}>{view.nameB} profile</Link>
      </p>
      <p className="text-sm">
        <Link className="underline" href="/disclosure">Payment never buys a higher rank.</Link>
      </p>
      {view.ranking ? (
        <p className="text-sm">
          <Link className="underline" href={view.ranking.href}>{view.ranking.label}</Link>
        </p>
      ) : null}
      <section>
        <h2 className="font-semibold text-3xl">Sources</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {view.sources.map((source) => (
            <li key={source}>
              <SourceLine text={source} />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function pairSide(slug: string, side: 'a' | 'b'): string {
  const [left, right] = slug.split('-vs-')
  return side === 'a' ? (left ?? '') : (right ?? '')
}

function CuratedTable({ view }: { view: CompareView }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
        <caption className="sr-only">{view.heading}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3">
              <span className="sr-only">Compared</span>
            </th>
            <th scope="col" className="py-2 pr-3">{view.nameA}</th>
            <th scope="col" className="py-2 pr-3">{view.nameB}</th>
            <th scope="col" className="py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.label} className="border-b border-line align-top">
              <th scope="row" className="py-3 pr-3">{row.label}</th>
              <td className="py-3 pr-3">{row.a}</td>
              <td className="py-3 pr-3">{row.b}</td>
              <td className="py-3">
                <SourceLine text={row.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SourceLine({ text }: { text: string }) {
  const internal = /^bestbotfor\.com(\/best\/[a-z0-9-]+)$/.exec(text)
  if (internal?.[1]) {
    return (
      <Link className="underline" href={internal[1]}>
        {text}
      </Link>
    )
  }
  const parts = text.split(/(https:\/\/[^\s)]+)/)
  return parts.map((part, index) =>
    part.startsWith('https://') ? (
      <a key={index} className="underline" href={part}>
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function AutoTable({
  a,
  b,
  rows,
}: {
  a: CatalogTool
  b: CatalogTool
  rows: ReturnType<typeof comparisonRows>
}) {
  return (
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
  )
}

function redirectReversedCuratedPair(parsed: { a: string; b: string }): void {
  const target = reversedCuratedComparePath(`${parsed.a}-vs-${parsed.b}`)
  if (target) permanentRedirect(target)
}

async function orderedPair(left: string, right: string): Promise<[CatalogTool | undefined, CatalogTool | undefined]> {
  const tools = await getToolsBySlugs([left, right])
  return [tools.find((tool) => tool.slug === left), tools.find((tool) => tool.slug === right)]
}
