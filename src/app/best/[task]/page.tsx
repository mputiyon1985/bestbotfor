import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { OutboundLink } from '@/components/outbound-link'
import { ToolLogo } from '@/components/tool-logo'
import { SponsoredPlacement, sponsoredCardIsVisible } from '@/components/sponsored-placement'
import { scheduleSponsorImpression } from '@/lib/sponsor-impressions'
import { readActiveBestPlacement } from '@/lib/best-placement'
import { getTask, listTaskCandidates } from '@/lib/catalog'
import { getDb } from '@/lib/db'
import { formatUsDate, priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import {
  BEST_GUIDE_FIT_LEGEND,
  BEST_GUIDE_TOOL_COUNT,
  bestGuideCrumb,
  bestGuideDescription,
  bestGuideFitAnswer,
  bestGuideHeading,
  bestGuideLead,
  bestGuideListName,
  bestGuideQuestion,
  bestGuideTitle,
  taskGerund,
} from '@/lib/descriptions'
import { matchesPath } from '@/lib/matches'
import { pageMetadata } from '@/lib/metadata'
import { slugSchema } from '@/lib/validation'

export async function generateMetadata({ params }: { params: Promise<{ task: string }> }): Promise<Metadata> {
  const { task: slug } = await params
  // Missing guides call notFound() so their noindex metadata is not hydrated as a second robots meta.
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const task = await getTask(slug)
  if (!task) notFound()
  return pageMetadata({
    title: bestGuideTitle(task.name),
    description: bestGuideDescription(task.name),
    path: `/best/${task.slug}`,
  })
}

export default async function BestPage({ params }: { params: Promise<{ task: string }> }) {
  const { task: slug } = await params
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const [loaded, headerStore, placement] = await Promise.all([
    listTaskCandidates(slug),
    headers(),
    readActiveBestPlacement(() => getDb(), slug),
  ])
  const task = loaded?.task
  const ranked = loaded?.tools ?? []
  const top = ranked[0]
  if (!task || !top) notFound()
  const nonce = headerStore.get('x-nonce')
  if (sponsoredCardIsVisible(placement)) {
    scheduleSponsorImpression({
      db: getDb(),
      sponsorshipId: placement.sponsorshipId,
      now: Date.now(),
      method: headerStore.get('x-bbf-method'),
      userAgent: headerStore.get('user-agent'),
      purpose: headerStore.get('purpose'),
      secPurpose: headerStore.get('sec-purpose'),
      routerPrefetch: headerStore.get('next-router-prefetch') ?? headerStore.get('next-router-segment-prefetch'),
      middlewarePrefetch: headerStore.get('x-middleware-prefetch'),
    })
  }
  const verified = formatUsDate(top.lastVerifiedAt)
  const freeOption = ranked.find((tool) => tool.hasFreeTier)
  const faqs = [
    {
      question: bestGuideQuestion(task.name),
      answer: `${bestGuideFitAnswer(task.name, top.name)} ${top.notes}`,
    },
    {
      question: 'Is there a free option?',
      answer: freeOption
        ? `${freeOption.name} has a free tier. Confirm what the free plan includes on the vendor’s site.`
        : 'None of the leading tools for this job in our catalog advertise a free tier.',
    },
    {
      question: 'Who is the top pick for?',
      answer: `${top.name} is usually a fit for ${skillLabel[top.skillLevel].toLowerCase()} users. The picker on the home page adjusts for your budget and experience.`,
    },
  ]
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: bestGuideCrumb(task.name), path: `/best/${task.slug}` },
  ]
  const shown = ranked.slice(0, BEST_GUIDE_TOOL_COUNT)
  const listLabel = `Tools ranked for ${taskGerund(task.name)}`

  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(bestGuideListName(task.name), `/best/${task.slug}`, shown)} nonce={nonce} />
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{bestGuideHeading(task.name)}</h1>
      <p className="text-lg">
        {bestGuideLead(task.name, top.name)} {top.shortDesc}
      </p>
      <p className="text-sm text-muted">Last reviewed {verified}. Prices change, so confirm them on the vendor’s site.</p>
      <p>
        <OutboundLink slug={top.slug} className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Visit {top.name}
        </OutboundLink>
      </p>
      <SponsoredPlacement placement={placement} />
      <div className="min-w-0 space-y-4">
        <p id="fit-legend" className="text-sm text-muted">{BEST_GUIDE_FIT_LEGEND}</p>
        <ul aria-label={listLabel} className="grid gap-3 md:hidden">
          {shown.map((tool) => (
            <li key={tool.slug} className="min-w-0 rounded-2xl border border-line p-4">
              <div className="flex min-w-0 items-center gap-3">
                <ToolLogo name={tool.name} slug={tool.slug} />
                <Link href={`/tools/${tool.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center break-words font-semibold underline">
                  {tool.name}
                </Link>
              </div>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm">
                <dt className="font-semibold" aria-describedby="fit-legend">Fit</dt>
                <dd><FitMatch score={tool.fitScore} /></dd>
                <dt className="font-semibold">Price</dt>
                <dd className="min-w-0 break-words">{priceLabel(tool)}</dd>
              </dl>
              <p className="mt-3 break-words text-sm">{tool.notes}</p>
            </li>
          ))}
        </ul>
        <div className="hidden min-w-0 md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">{listLabel}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">Tool</th>
                <th scope="col" aria-describedby="fit-legend" className="w-36 whitespace-nowrap py-2 pr-3">Fit</th>
                <th scope="col" className="w-44 py-2 pr-3">Price</th>
                <th scope="col" className="py-2">Why it is here</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tool) => (
                <tr key={tool.slug} className="border-b border-line align-top">
                  <th scope="row" className="py-3 pr-3 font-semibold">
                    <span className="flex min-w-0 items-center gap-3">
                      <ToolLogo name={tool.name} slug={tool.slug} />
                      <Link href={`/tools/${tool.slug}`} className="flex min-h-11 min-w-0 flex-1 items-center break-words underline">
                        {tool.name}
                      </Link>
                    </span>
                  </th>
                  <td className="py-3 pr-3"><FitMatch score={tool.fitScore} /></td>
                  <td className="break-words py-3 pr-3">{priceLabel(tool)}</td>
                  <td className="break-words py-3">{tool.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <Link href={matchesPath(task.slug, 'any', 1)} className="inline-flex min-h-11 items-center font-semibold underline">
            See all matches
          </Link>
        </p>
      </div>
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
        Want this personalized? <Link className="underline" href="/">Get your own pick in 30 seconds</Link>: answer three questions.
      </p>
    </article>
  )
}

function FitMatch({ score }: { score: number }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-mist px-2.5 py-1 text-sm font-semibold">
      {`${score}% match`}
    </span>
  )
}
