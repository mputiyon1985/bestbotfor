import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { DailyBotCapture } from '@/components/daily-bot-capture'
import { JsonLd } from '@/components/json-ld'
import { ToolLogo } from '@/components/tool-logo'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import { bestGuideCrumb, bestGuideHeading, taskGerund } from '@/lib/descriptions'
import { loadFreePage } from '@/lib/free-page-data'
import { formatUsDate, priceLabel } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { matchesPath } from '@/lib/matches'
import { pageMetadata } from '@/lib/metadata'
import { bestFreeDescription, bestFreeHeading, bestFreePath, bestFreeTitle } from '@/lib/seo-pages'
import { guidePath } from '@/content/guides'
import { slugSchema } from '@/lib/validation'

async function load(slug: string) {
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const page = await loadFreePage(slug)
  if (!page) notFound()
  return page
}

export async function generateMetadata({ params }: { params: Promise<{ task: string }> }): Promise<Metadata> {
  const { task: slug } = await params
  const page = await load(slug)
  return pageMetadata({
    title: bestFreeTitle(page.task.name),
    description: bestFreeDescription(page.task.name, page.indexable),
    path: bestFreePath(page.task.slug),
    // Forge's rule: noindex unless every listed tool has a fresh, sourced free-plan note.
    noIndex: !page.indexable,
    follow: true,
  })
}

export default async function BestFreePage({ params }: { params: Promise<{ task: string }> }) {
  const { task: slug } = await params
  const page = await load(slug)
  const { task, tools, ranked, indexable, totalFree } = page
  const nonce = (await headers()).get('x-nonce')
  const top = tools[0]
  if (!top) notFound()
  const paidPick = ranked[0]
  const path = bestFreePath(task.slug)
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: bestGuideCrumb(task.name), path: `/best/${task.slug}` },
    { name: 'Free', path },
  ]
  const faqs = [
    {
      question: `${bestFreeHeading(task.name).replace(/^Best/, 'What is the best')}?`,
      answer: `${top.name} is the top free pick in this catalog. ${top.freePlan?.freePlanNote ?? 'Confirm what its free plan includes on the vendor’s site.'}`,
    },
    {
      question: 'Are these tools completely free?',
      answer: 'Each one has a free plan or is free to use, but free plans have limits. The note under each tool says what the vendor’s own page lists, and when we checked it.',
    },
  ]
  return (
    <article className="space-y-8" data-free-plan-index={indexable ? 'index' : 'noindex'}>
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(bestFreeHeading(task.name), path, tools)} nonce={nonce} />
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{bestFreeHeading(task.name)}</h1>
      <p className="text-lg">
        {bestFreeHeading(task.name).replace(/^Best/, 'The best')} is {top.name}. These are the {tools.length} highest-ranked tools for this job
        that you can start without paying, out of {totalFree} with a free plan in our catalog.
      </p>
      {indexable ? null : (
        <p role="note" className="text-sm text-muted">
          Some free-plan details on this page have not been checked recently. Confirm each free plan on the vendor’s site.
        </p>
      )}
      <ol aria-label={`Free tools ranked for ${taskGerund(task.name)}`} className="space-y-4">
        {tools.map((tool, index) => (
          <li key={tool.slug} className="min-w-0 rounded-2xl border border-line p-4" data-free-plan-status={tool.freePlanStatus}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-sm text-muted">{index + 1}.</span>
              <ToolLogo name={tool.name} slug={tool.slug} />
              <Link href={`/tools/${tool.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center break-words font-semibold underline">
                {tool.name}
              </Link>
              <span className="inline-flex whitespace-nowrap rounded-full bg-mist px-2.5 py-1 text-sm font-semibold">{`${tool.fitScore}% match`}</span>
            </div>
            <p className="mt-2 break-words text-sm">{tool.notes}</p>
            <h2 className="mt-3 text-sm font-semibold">What the free plan includes</h2>
            {tool.freePlan && tool.freePlanStatus !== 'missing' ? (
              <>
                <p className="break-words text-sm">{tool.freePlan.freePlanNote}</p>
                <p className="text-sm text-muted">
                  Source:{' '}
                  <a href={tool.freePlan.freePlanSource} rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center break-all underline">
                    {tool.name} pricing
                  </a>
                  , checked <time dateTime={tool.freePlan.freePlanCheckedAt}>{formatUsDate(tool.freePlan.freePlanCheckedAt)}</time>
                  {tool.freePlanStatus === 'stale' ? '. This check is more than 90 days old.' : '.'}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">We have not checked this free plan yet. Confirm it on the vendor’s site.</p>
            )}
          </li>
        ))}
      </ol>
      <p>
        <Link href={matchesPath(task.slug, 'free', 1)} className="inline-flex min-h-11 items-center font-semibold underline">
          See every free match
        </Link>
      </p>
      {paidPick ? (
        <section aria-labelledby="when-to-pay">
          <h2 id="when-to-pay" className="font-semibold text-3xl">When to pay</h2>
          <p className="mt-2">
            {paidPick.slug === top.slug
              ? `${paidPick.name} is also the top pick without the free-only filter (${priceLabel(paidPick)}). Pay when the free plan’s limits get in the way of the job.`
              : `Without the free-only filter, the top pick is ${paidPick.name} (${priceLabel(paidPick)}). Pay when the free plan’s limits get in the way of the job.`}{' '}
            <Link className="underline" href={`/best/${task.slug}`}>{bestGuideHeading(task.name)}</Link>.
          </p>
        </section>
      ) : null}
      <section>
        <h2 className="font-semibold text-3xl">Questions</h2>
        <dl className="mt-4 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold">{faq.question}</dt>
              <dd className="text-muted">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-sm text-muted">
        Want this personalized? <Link className="underline" href="/">Answer 3 questions</Link> and choose Free only.{' '}
        <Link className="underline" href={guidePath('how-to-choose-an-ai-tool')}>How to choose an AI tool</Link>.
      </p>
      <DailyBotCapture source="best" />
    </article>
  )
}
