import Link from 'next/link'
import { DailyBotCapture } from '@/components/daily-bot-capture'
import { JsonLd } from '@/components/json-ld'
import { AffiliateDisclosure } from '@/components/affiliate-disclosure'
import { OutboundLink } from '@/components/outbound-link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { ToolLogo } from '@/components/tool-logo'
import { EditorialCompact } from '@/components/editorial'
import { priceLabel } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { MATCHES_PAGE_SIZE, matchBudgetLabel, matchBudgets, matchesPath } from '@/lib/matches'
import { paginationItems, showingLabel } from '@/lib/pagination'
import { matchesPageTitle } from '@/lib/result-index'
import type { CatalogTask } from '@/lib/catalog-types'
import type { EditorialScore, ProCon } from '@/lib/editorial'
import type { QuizPick, RankBudget, ScoreableTool } from '@/lib/scoring'

type MatchTool = QuizPick<
  ScoreableTool & { shortDesc?: string; hasAffiliateLink?: boolean; editorial?: EditorialScore | null; pros?: ProCon[]; cons?: ProCon[] }
>

export function AllMatches({
  task,
  budget,
  page,
  pageCount,
  total,
  tools,
  nonce,
}: {
  task: CatalogTask
  budget: RankBudget
  page: number
  pageCount: number
  total: number
  tools: MatchTool[]
  nonce: string | null
}) {
  const path = matchesPath(task.slug, budget, page)
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: task.name, path: `/best/${task.slug}` },
    { name: 'All matches', path },
  ]
  const noun = total === 1 ? 'match' : 'matches'

  return (
    <article className="min-w-0 space-y-8 break-words">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(`Matches for ${task.name.toLowerCase()}`, path, tools)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="break-words font-bold text-5xl leading-tight">{matchesPageTitle(task.name, budget, page)}</h1>
      <p className="text-muted">
        {total} {noun} with a strong fit. Page {page} of {pageCount}. Ranked for {matchBudgetLabel[budget].toLowerCase()}.
      </p>
      <nav aria-label="Filter by budget">
        <ul className="flex flex-wrap gap-2">
          {matchBudgets.map((item) => (
            <li key={item}>
              <Link
                href={matchesPath(task.slug, item, 1)}
                aria-current={item === budget ? 'page' : undefined}
                className={`inline-flex min-h-12 items-center rounded-full border px-4 text-sm font-semibold ${
                  item === budget ? 'border-indigo bg-indigo text-white' : 'border-line bg-card hover:border-accent'
                }`}
              >
                {matchBudgetLabel[item]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tools.length === 0 ? <p>No tools in this catalog clear that budget yet.</p> : null}
      {tools.length > 0 ? (
        <ul aria-label="Matches" className="grid gap-4">
          {tools.map((tool) => (
            <li key={tool.slug} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ToolLogo name={tool.name} slug={tool.slug} />
                <h2 className="min-w-0 font-semibold text-2xl">
                  <Link href={`/tools/${tool.slug}`} className="underline-offset-4 hover:underline">
                    {tool.name}
                  </Link>
                </h2>
              </div>
              <p className="mt-2 text-sm text-muted">{tool.reason}</p>
              <EditorialCompact editorial={tool.editorial} pros={tool.pros} cons={tool.cons} />
              <p className="mt-2 text-sm">{priceLabel(tool)}</p>
              <OutboundLink slug={tool.slug} affiliate={Boolean(tool.hasAffiliateLink)} className="mt-3 inline-flex min-h-12 items-center font-semibold underline">
                Visit {tool.name}
              </OutboundLink>
{tool.hasAffiliateLink ? <AffiliateDisclosure affiliate /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <nav aria-label="Pages" className="max-w-full space-y-4 text-sm font-semibold">
        <p>{showingLabel(page, MATCHES_PAGE_SIZE, total)}</p>
        <ol className="flex max-w-full flex-wrap items-center gap-2">
          {paginationItems(page, pageCount).map((item, index) =>
            item === 'ellipsis' ? (
              <li key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-muted">
                …
              </li>
            ) : (
              <li key={item}>
                <Link
                  href={matchesPath(task.slug, budget, item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? 'page' : undefined}
                  className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border px-3 ${
                    item === page ? 'border-indigo bg-indigo text-white' : 'border-line bg-card hover:border-accent'
                  }`}
                >
                  {item}
                </Link>
              </li>
            ),
          )}
        </ol>
        <div className="flex max-w-full flex-wrap items-center gap-4">
          {page > 1 ? (
            <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-4 hover:border-accent" href={matchesPath(task.slug, budget, page - 1)}>
              Previous page
            </Link>
          ) : null}
          {page < pageCount ? (
            <Link className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-card px-4 hover:border-accent" href={matchesPath(task.slug, budget, page + 1)}>
              Next page
            </Link>
          ) : null}
        </div>
      </nav>
      <DailyBotCapture source="result" />
    </article>
  )
}
