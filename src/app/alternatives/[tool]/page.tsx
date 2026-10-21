import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { DailyBotCapture } from '@/components/daily-bot-capture'
import { JsonLd } from '@/components/json-ld'
import { ToolLogo } from '@/components/tool-logo'
import {
  ALTERNATIVE_BUDGETS,
  SWITCH_REASON_COUNT,
  alternativesBudgetPath,
  alternativesDescription,
  alternativesHeading,
  alternativesPath,
  alternativesTitle,
  comparePairsFor,
  getAlternativePage,
  parseAlternativeBudget,
  rankAlternatives,
} from '@/lib/alternatives'
import { listTaskCandidates } from '@/lib/catalog'
import { alternativesNewsletterSource } from '@/lib/newsletter-source'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import { bestGuideHeading } from '@/lib/descriptions'
import { budgetLabel, priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { slugSchema } from '@/lib/validation'

type Props = {
  params: Promise<{ tool: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function load(slug: string) {
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const page = getAlternativePage(slug)
  if (!page) notFound()
  const loaded = await listTaskCandidates(page.task)
  const subject = loaded?.tools.find((tool) => tool.slug === page.tool)
  if (!loaded || !subject) notFound()
  return { page, task: loaded.task, candidates: loaded.tools, subject }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ tool: slug }, query] = await Promise.all([params, searchParams])
  const budget = parseAlternativeBudget(query.budget)
  const { subject, task } = await load(slug)
  return pageMetadata({
    title: alternativesTitle(subject.name),
    absoluteTitle: true,
    description: alternativesDescription(subject.name, slug === 'cursor' ? task.name : undefined),
    path: alternativesPath(subject.slug),
    // Budget chips repeat the canonical list with rows removed, like /result budget filters.
    noIndex: budget !== 'any',
    follow: true,
  })
}

export default async function AlternativesPage({ params, searchParams }: Props) {
  const [{ tool: slug }, query, headerStore] = await Promise.all([params, searchParams, headers()])
  const budget = parseAlternativeBudget(query.budget)
  if (!budget) notFound()
  const { task, candidates, subject } = await load(slug)
  const nonce = headerStore.get('x-nonce')
  const ranked = rankAlternatives(candidates, subject.slug, budget)
  const closest = rankAlternatives(candidates, subject.slug, 'any')[0]
  const path = alternativesPath(subject.slug)
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: subject.name, path: `/tools/${subject.slug}` },
    { name: 'Alternatives', path },
  ]
  const pairs = comparePairsFor(subject.slug)
  const names = new Map(candidates.map((tool) => [tool.slug, tool.name]))
  const reasons = subject.cons.slice(0, SWITCH_REASON_COUNT)
  const newsletterSource = alternativesNewsletterSource(subject.slug)
  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(alternativesHeading(subject.name), path, ranked)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{alternativesHeading(subject.name)}</h1>
      {closest ? (
        <p className="text-lg">
          The closest {subject.name} alternative is {closest.name}. {closest.notes}
        </p>
      ) : null}
      <nav aria-label="Budget" className="flex flex-wrap gap-2">
        {ALTERNATIVE_BUDGETS.map((option) => (
          <Link
            key={option}
            href={alternativesBudgetPath(subject.slug, option)}
            aria-current={option === budget ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm ${option === budget ? 'bg-mist font-semibold' : ''}`}
          >
            {budgetLabel[option]}
          </Link>
        ))}
      </nav>
      {ranked.length === 0 ? (
        <p>No alternatives in our catalog fit this budget yet.</p>
      ) : (
        <ol aria-label={`${subject.name} alternatives ranked by fit`} className="space-y-4">
          {ranked.map((tool, index) => (
            <li key={tool.slug} className="min-w-0 rounded-2xl border border-line p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-sm text-muted">{index + 1}.</span>
                <ToolLogo name={tool.name} slug={tool.slug} />
                <Link href={`/tools/${tool.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center break-words font-semibold underline">
                  {tool.name}
                </Link>
                <span className="inline-flex whitespace-nowrap rounded-full bg-mist px-2.5 py-1 text-sm font-semibold">{`${tool.fitScore}% match`}</span>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="font-semibold">Price</dt>
                <dd className="min-w-0 break-words">{priceLabel(tool)}</dd>
                <dt className="font-semibold">Level</dt>
                <dd>{skillLabel[tool.skillLevel]}</dd>
              </dl>
              <p className="mt-2 break-words text-sm">{tool.notes}</p>
              {tool.pros.length > 0 || tool.cons.length > 0 ? (
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  {tool.pros.length > 0 ? (
                    <ul aria-label={`${tool.name} pros`} className="list-disc pl-5">
                      {tool.pros.slice(0, 2).map((point) => <li key={point.text}>{point.text}</li>)}
                    </ul>
                  ) : null}
                  {tool.cons.length > 0 ? (
                    <ul aria-label={`${tool.name} cons`} className="list-disc pl-5 text-muted">
                      {tool.cons.slice(0, 2).map((point) => <li key={point.text}>{point.text}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {pairs.length > 0 ? (
        <section aria-labelledby="head-to-head">
          <h2 id="head-to-head" className="font-semibold text-3xl">Compare head to head</h2>
          <ul className="mt-3 space-y-1">
            {pairs.map(([left, right]) => (
              <li key={`${left}-${right}`}>
                <Link className="inline-flex min-h-11 items-center underline" href={`/compare/${left}-vs-${right}`}>
                  {names.get(left) ?? left} vs {names.get(right) ?? right}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {reasons.length > 0 ? (
        <section aria-labelledby="why-switch">
          <h2 id="why-switch" className="font-semibold text-3xl">Why people switch from {subject.name}</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {reasons.map((point) => <li key={point.text}>{point.text}</li>)}
          </ul>
        </section>
      ) : null}
      <p>
        <Link className="underline" href={`/tools/${subject.slug}`}>{subject.name} profile</Link> ·{' '}
        <Link className="underline" href={`/best/${task.slug}`}>{bestGuideHeading(task.name)}</Link>
      </p>
      <p className="text-sm text-muted">
        Want this personalized? <Link className="underline" href="/">Answer 3 questions</Link> and get your pick in 30 seconds. Payment never buys a higher rank.
      </p>
      {newsletterSource ? <DailyBotCapture source={newsletterSource} /> : null}
    </article>
  )
}
