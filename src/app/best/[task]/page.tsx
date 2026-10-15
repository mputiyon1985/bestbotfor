import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { OutboundLink } from '@/components/outbound-link'
import { getCatalog, getTask } from '@/lib/catalog'
import { formatUsDate, priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { pageMetadata } from '@/lib/metadata'
import { toolsForTask } from '@/lib/recommend'

export async function generateMetadata({ params }: { params: Promise<{ task: string }> }): Promise<Metadata> {
  const { task: slug } = await params
  const task = await getTask(slug)
  if (!task) return pageMetadata({ title: 'Not found', description: 'That guide is not in the catalog.', path: `/best/${slug}`, noIndex: true })
  return pageMetadata({
    title: `Best AI tool for ${task.name.toLowerCase()}`,
    description: `The best AI tool for ${task.name.toLowerCase()} in our catalog, plus the closest alternatives. ${task.description}`,
    path: `/best/${task.slug}`,
  })
}

export default async function BestPage({ params }: { params: Promise<{ task: string }> }) {
  const { task: slug } = await params
  const task = await getTask(slug)
  if (!task) notFound()
  const catalog = await getCatalog()
  const ranked = toolsForTask(catalog, task.slug)
  const top = ranked[0]
  if (!top) notFound()
  const nonce = (await headers()).get('x-nonce')
  const verified = formatUsDate(top.lastVerifiedAt)
  const freeOption = ranked.find((tool) => tool.hasFreeTier)
  const faqs = [
    {
      question: `What is the best AI tool for ${task.name.toLowerCase()}?`,
      answer: `${top.name} is the top pick in this catalog for ${task.name.toLowerCase()}. ${top.notes}`,
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
    { name: `Best for ${task.name.toLowerCase()}`, path: `/best/${task.slug}` },
  ]

  return (
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(`Best AI tools for ${task.name.toLowerCase()}`, `/best/${task.slug}`, ranked.slice(0, 5))} nonce={nonce} />
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-serif text-5xl leading-tight">Best AI tool for {task.name.toLowerCase()}</h1>
      <p className="text-lg">
        The best AI tool for {task.name.toLowerCase()} is {top.name}. {top.shortDesc}
      </p>
      <p className="text-sm text-muted">Last reviewed {verified}. Prices change, so confirm them on the vendor’s site.</p>
      <p>
        <OutboundLink slug={top.slug} className="inline-flex min-h-12 items-center rounded-full bg-forest px-5 font-semibold text-white">
          Visit {top.name}
        </OutboundLink>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">Tools ranked for {task.name}</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3">Tool</th>
              <th scope="col" className="py-2 pr-3">Fit</th>
              <th scope="col" className="py-2 pr-3">Price</th>
              <th scope="col" className="py-2">Why it is here</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 5).map((tool) => (
              <tr key={tool.slug} className="border-b border-line align-top">
                <th scope="row" className="py-3 pr-3 font-semibold">
                  <Link href={`/tools/${tool.slug}`} className="underline">
                    {tool.name}
                  </Link>
                </th>
                <td className="py-3 pr-3">{tool.fitScore}</td>
                <td className="py-3 pr-3">{priceLabel(tool)}</td>
                <td className="py-3">{tool.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h2 className="font-serif text-3xl">Questions</h2>
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
        Want this personalized? <Link className="underline" href="/">Answer the three questions</Link>.
      </p>
    </article>
  )
}
