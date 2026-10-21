import type { Metadata } from 'next'
import { DealList } from '@/components/deal-card'
import { loadDealViews } from '@/lib/deals'
import { servesAffiliateLink } from '@/lib/go-redirect'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ProsConsSection, ScoreSection } from '@/components/editorial'
import { JsonLd } from '@/components/json-ld'
import { AffiliateDisclosure } from '@/components/affiliate-disclosure'
import { OutboundLink } from '@/components/outbound-link'
import { ToolLogo } from '@/components/tool-logo'
import { comparePairSeeds } from '@/data/catalog'
import { alternativesPath, getAlternativePage } from '@/lib/alternatives'
import { getTool, getToolsBySlugs } from '@/lib/catalog'
import { formatUsDate, priceLabel, skillLabel } from '@/lib/format'
import { breadcrumbJsonLd, softwareJsonLd } from '@/lib/jsonld'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import { pageMetadata } from '@/lib/metadata'
import { slugSchema } from '@/lib/validation'
import { toolMetaDescription, toolMetaTitle } from '@/lib/tool-meta'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  // notFound() keeps this page's robots metadata out of the client payload.
  // Returning noindex here hydrated a second robots meta beside Next's tag.
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const tool = await getTool(slug)
  if (!tool) notFound()
  return pageMetadata({
    title: toolMetaTitle(tool),
    absoluteTitle: true,
    description: toolMetaDescription(tool),
    path: `/tools/${tool.slug}`,
  })
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) notFound()
  const partnerSlugs = comparePairSeeds.flatMap(([left, right]) => {
    if (left === slug) return [right]
    if (right === slug) return [left]
    return []
  })
  const [tool, partners, headerStore, toolDeals] = await Promise.all([
    getTool(slug),
    getToolsBySlugs(partnerSlugs),
    headers(),
    loadDealViews(slug),
  ])
  if (!tool) notFound()
  const nonce = headerStore.get('x-nonce')
  const comparisons = comparePairSeeds.filter(([left, right]) => left === tool.slug || right === tool.slug)
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: tool.name, path: `/tools/${tool.slug}` },
  ]
  const partnerName = new Map(partners.map((item) => [item.slug, item.name]))

  return (
    <article className="min-w-0 space-y-8 break-words">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={softwareJsonLd(tool)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">{tool.category}</p>
      <div className="flex min-w-0 items-start gap-3">
        <ToolLogo name={tool.name} slug={tool.slug} />
        <h1 className="min-w-0 break-words font-bold text-5xl">{tool.name}</h1>
      </div>
      <p className="text-lg">{tool.shortDesc}</p>
      <p className="max-w-2xl text-muted">{tool.longDesc}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label="Vendor" value={tool.vendor} />
        <Item label="Price" value={priceLabel(tool)} />
        <Item label="Experience" value={skillLabel[tool.skillLevel]} />
        <Item label="Platforms" value={tool.platforms.join(', ')} />
        <Item label="Last reviewed" value={formatUsDate(tool.lastVerifiedAt)} />
        <Item label="Free tier" value={tool.hasFreeTier ? 'Yes' : 'No'} />
      </dl>
      <p>
        <OutboundLink slug={tool.slug} affiliate={servesAffiliateLink(tool.slug, tool.affiliate.affiliateUrl)} className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Visit {tool.name}
        </OutboundLink>
      </p>
      <AffiliateDisclosure affiliate={servesAffiliateLink(tool.slug, tool.affiliate.affiliateUrl)} vendor={tool.vendor} />
      {toolDeals.views.length > 0 ? (
        <section aria-labelledby="tool-deals" className="space-y-3" data-tool-deals>
          <h2 id="tool-deals" className="font-semibold text-2xl">Member deal</h2>
          <DealList deals={toolDeals.views} />
        </section>
      ) : null}
      {tool.affiliate.commissionNote ? (
        <p className="text-sm text-muted">Program note, copied from the vendor’s page: {tool.affiliate.commissionNote}</p>
      ) : null}
      <ScoreSection editorial={tool.editorial} />
      <ProsConsSection pros={tool.pros} cons={tool.cons} />
      <section>
        <h2 className="font-semibold text-3xl">Jobs it fits</h2>
        <ul className="mt-3 space-y-3">
          {tool.fits.map((fit) => (
            <li key={fit.taskSlug}>
              <Link href={`/best/${fit.taskSlug}`} className="font-semibold underline">
                {fit.taskName}
              </Link>
              <span className="text-muted"> — {fit.notes} Fit score {fit.score}.</span>
            </li>
          ))}
        </ul>
      </section>
      {getAlternativePage(tool.slug) ? (
        <p>
          <Link className="inline-flex min-h-11 items-center font-semibold underline" href={alternativesPath(tool.slug)}>
            Alternatives to {tool.name}
          </Link>
        </p>
      ) : null}
      {comparisons.length > 0 ? (
        <section>
          <h2 className="font-semibold text-3xl">Comparisons</h2>
          <ul className="mt-3 space-y-2">
            {comparisons.map(([left, right]) => {
              const other = left === tool.slug ? right : left
              const otherName = partnerName.get(other)
              return (
                <li key={`${left}-${right}`}>
                  <Link className="underline" href={`/compare/${left}-vs-${right}`}>
                    {tool.name} vs {otherName ?? other}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
