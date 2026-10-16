import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { OutboundLink } from '@/components/outbound-link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { priceLabel } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/jsonld'
import { matchBudgetLabel, matchBudgets, matchesPath } from '@/lib/matches'
import type { CatalogTask } from '@/lib/catalog-types'
import type { QuizPick, RankBudget, ScoreableTool } from '@/lib/scoring'

type MatchTool = QuizPick<ScoreableTool & { shortDesc?: string }>

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
    <article className="space-y-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <JsonLd data={itemListJsonLd(`Matches for ${task.name.toLowerCase()}`, path, tools)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <h1 className="font-bold text-5xl leading-tight">All matches for {task.name.toLowerCase()}</h1>
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
              <h2 className="font-semibold text-2xl">
                <Link href={`/tools/${tool.slug}`} className="underline-offset-4 hover:underline">
                  {tool.name}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-muted">{tool.reason}</p>
              <p className="mt-2 text-sm">{priceLabel(tool)}</p>
              <OutboundLink slug={tool.slug} className="mt-3 inline-flex min-h-12 items-center font-semibold underline">
                Visit {tool.name}
              </OutboundLink>
            </li>
          ))}
        </ul>
      ) : null}
      <nav aria-label="Pages" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        {page > 1 ? (
          <Link className="underline" href={matchesPath(task.slug, budget, page - 1)}>
            Previous page
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link className="underline" href={matchesPath(task.slug, budget, page + 1)}>
            Next page
          </Link>
        ) : null}
      </nav>
    </article>
  )
}
