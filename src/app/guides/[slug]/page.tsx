import { seoMeta } from '@/content/seo-meta'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { DailyBotCapture } from '@/components/daily-bot-capture'
import { JsonLd } from '@/components/json-ld'
import { getGuide, guidePath } from '@/content/guides'
import { EDITOR_BYLINE, categoryGuideArticleJsonLd, getCategoryGuide, type CategoryGuide } from '@/content/category-guides'
import { GuideMarkdown } from '@/components/guide-markdown'
import { taskSeeds } from '@/data/catalog'
import { bestGuideHeading } from '@/lib/descriptions'
import { formatUsDate } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { absoluteUrl, SITE_NAME } from '@/lib/site'
import { LOADOUT_PATH, bestFreeHeading, bestFreePath } from '@/lib/seo-pages'
import { isFreePageTask } from '@/lib/free-plan'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const categoryGuide = getCategoryGuide(slug)
  if (categoryGuide) {
    const override = seoMeta(guidePath(slug))
    return pageMetadata({
      title: override?.title ?? categoryGuide.title,
      absoluteTitle: override ? true : undefined,
      description: override?.description ?? categoryGuide.description,
      path: guidePath(slug),
    })
  }
  const guide = getGuide(slug)
  if (!guide) notFound()
  return pageMetadata({ title: guide.title, description: guide.description, path: guidePath(guide.slug) })
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const categoryGuide = getCategoryGuide(slug)
  if (categoryGuide) return <CategoryGuidePage guide={categoryGuide} nonce={(await headers()).get('x-nonce')} />
  const guide = getGuide(slug)
  if (!guide) notFound()
  const nonce = (await headers()).get('x-nonce')
  const path = guidePath(guide.slug)
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: guide.crumb, path },
  ]
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.heading,
    description: guide.description,
    url: absoluteUrl(path),
    dateModified: guide.updatedAt,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  }
  return (
    <article className="max-w-2xl space-y-6">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={article} nonce={nonce} />
      <JsonLd data={faqJsonLd(guide.faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{guide.heading}</h1>
      <p className="text-lg">{guide.answer}</p>
      <p className="text-sm text-muted">Updated {formatUsDate(guide.updatedAt)}.</p>
      {guide.sections.map((section) => (
        <section key={section.id} aria-labelledby={`guide-${section.id}`} className="space-y-3">
          <h2 id={`guide-${section.id}`} className="font-semibold text-3xl">{section.heading}</h2>
          {section.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
          {section.terms ? (
            <dl className="space-y-2">
              {section.terms.map((item) => (
                <div key={item.term}>
                  <dt className="font-semibold">{item.term}</dt>
                  <dd className="text-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {section.taskLinks ? (
            <ul aria-label="Jobs we cover" className="grid gap-1 sm:grid-cols-2">
              {taskSeeds.map((task) => (
                <li key={task.slug}>
                  <Link href={`/best/${task.slug}`} className="inline-flex min-h-11 items-center underline">
                    {bestGuideHeading(task.name)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {section.freeLinks ? (
            <ul aria-label="Free tools by job" className="grid gap-1 sm:grid-cols-2">
              {taskSeeds.filter((task) => isFreePageTask(task.slug)).map((task) => (
                <li key={task.slug}>
                  <Link href={bestFreePath(task.slug)} className="inline-flex min-h-11 items-center underline">
                    {bestFreeHeading(task.name)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {section.link ? (
            <p>
              <Link href={section.link.href} className="inline-flex min-h-11 items-center font-semibold underline">
                {section.link.label}
              </Link>
            </p>
          ) : null}
        </section>
      ))}
      <p>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Get your pick in 30 seconds
        </Link>
      </p>
      <section aria-labelledby="guide-faq">
        <h2 id="guide-faq" className="font-semibold text-3xl">Questions</h2>
        <dl className="mt-4 space-y-4">
          {guide.faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold">{faq.question}</dt>
              <dd className="text-muted">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-sm text-muted">
        Want every pick on one page? <Link className="underline" href={LOADOUT_PATH}>Get the AI Loadout</Link>.
      </p>
      <DailyBotCapture source="guides" />
    </article>
  )
}

function CategoryGuidePage({ guide, nonce }: { guide: CategoryGuide; nonce: string | null }) {
  const task = taskSeeds.find((item) => item.slug === guide.category)
  const path = guidePath(guide.category)
  const crumbs = [
    { name: 'Home', path: '/' },
    ...(task ? [{ name: bestGuideHeading(task.name), path: `/best/${task.slug}` }] : []),
    { name: 'Guide', path },
  ]
  return (
    <article className="max-w-2xl space-y-4" data-category-guide={guide.category}>
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={categoryGuideArticleJsonLd(guide)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">{guide.heading}</h1>
      <p className="text-sm text-muted">
        <span data-byline>{EDITOR_BYLINE}</span>. Checked {formatUsDate(guide.checked)}.
      </p>
      <GuideMarkdown markdown={guide.body} />
      <DailyBotCapture source="guides" />
    </article>
  )
}
