import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { OutboundLink } from '@/components/outbound-link'
import { EditorialCompact } from '@/components/editorial'
import { listTaskCandidates, recommendQuiz } from '@/lib/catalog'
import { listMatches, matchBudgetLabel, matchesPageRequest, matchesPath, pageOfMatches, seeAllMatchesLabel } from '@/lib/matches'
import { matchesPageTitle, matchesRobots, quizResultRobots, quizResultTitle } from '@/lib/result-index'
import { AllMatches } from './all-matches'
import { ACTION_LIMITS, allowRate } from '@/lib/action-limit'
import { getDb } from '@/lib/db'
import { rateLimitKey, clientIp } from '@/lib/ip'
import { budgetLabel, budgetPhrase, fewStrongOptionsLabel, overBudgetLabel, priceLabel, skillLabel, skillPhrase } from '@/lib/format'
import { QUIZ_ALTERNATIVE_COUNT } from '@/lib/scoring'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { memberAccess } from '@/lib/members'
import { pageMetadata } from '@/lib/metadata'
import { absoluteUrl } from '@/lib/site'
import { firstString, matchBudgetSchema, quizSchema, slugSchema } from '@/lib/validation'
import { savePickAction } from './actions'

async function loadAllMatches(params: Record<string, string | string[] | undefined>) {
  const taskSlug = firstString(params.task)
  if (!slugSchema.safeParse(taskSlug).success) return null
  const rawBudget = firstString(params.budget)
  const parsedBudget = rawBudget === '' ? { success: true as const, data: 'any' as const } : matchBudgetSchema.safeParse(rawBudget)
  if (!parsedBudget.success) return null
  const loaded = await listTaskCandidates(taskSlug)
  if (!loaded) return null
  const matches = listMatches(loaded.tools, parsedBudget.data)
  const requested = matchesPageRequest(firstString(params.page), matches.length)
  if (!requested) return null
  return {
    task: loaded.task,
    budget: parsedBudget.data,
    total: matches.length,
    tools: pageOfMatches(matches, requested.page),
    page: requested.page,
    pageCount: requested.pageCount,
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const params = await searchParams
  const view = firstString(params.view)
  if (view !== '' && view !== 'all') notFound()
  if (view === 'all') {
    const loaded = await loadAllMatches(params)
    if (!loaded) notFound()
    const path = matchesPath(loaded.task.slug, loaded.budget, loaded.page)
    const robots = matchesRobots(loaded.budget)
    const title = matchesPageTitle(loaded.task.name, loaded.budget, loaded.page)
    return pageMetadata({
      title,
      description: `${loaded.total} tools with a strong fit for ${loaded.task.name}, ranked for ${matchBudgetLabel[loaded.budget].toLowerCase()}.`,
      path,
      noIndex: !robots.index,
      follow: robots.follow,
      pagination: {
        previous: loaded.page > 1 ? matchesPath(loaded.task.slug, loaded.budget, loaded.page - 1) : null,
        next: loaded.page < loaded.pageCount ? matchesPath(loaded.task.slug, loaded.budget, loaded.page + 1) : null,
      },
    })
  }
  const parsed = quizSchema.safeParse({
    task: firstString(params.task),
    budget: firstString(params.budget),
    skill: firstString(params.skill),
  })
  if (!parsed.success) {
    return pageMetadata({
      title: 'Your result',
      description: 'Answer the three questions to get a best AI tool and up to six alternatives.',
      path: '/result',
      noIndex: true,
    })
  }
  const result = await recommendQuiz(parsed.data)
  const pick = result?.picks[0]
  const title = result && pick ? quizResultTitle(result.task.name, pick.name) : 'Your result'
  const description =
    result && pick
      ? `${pick.name} is the top pick for ${result.task.name.toLowerCase()} ${budgetPhrase(parsed.data.budget)} for ${skillPhrase(parsed.data.skill)}.`
      : 'No matching tools for that combination.'
  const query = new URLSearchParams(parsed.data).toString()
  const robots = quizResultRobots()
  return pageMetadata({
    title,
    description,
    path: `/result?${query}`,
    imagePath: `/api/og?kind=result&${query}`,
    noIndex: !robots.index,
    follow: robots.follow,
  })
}

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const view = firstString(params.view)
  if (view !== '' && view !== 'all') notFound()
  const headerStore = await headers()
  if (view === 'all') {
    const loaded = await loadAllMatches(params)
    if (!loaded) notFound()
    return (
      <AllMatches
        task={loaded.task}
        budget={loaded.budget}
        page={loaded.page}
        pageCount={loaded.pageCount}
        total={loaded.total}
        tools={loaded.tools}
        nonce={headerStore.get('x-nonce')}
      />
    )
  }
  const parsed = quizSchema.safeParse({
    task: firstString(params.task),
    budget: firstString(params.budget),
    skill: firstString(params.skill),
  })
  const nonce = headerStore.get('x-nonce')
  const allowed = await allowRate(
    getDb(),
    rateLimitKey(clientIp(headerStore), 'result'),
    ACTION_LIMITS.result.limit,
    ACTION_LIMITS.result.windowMs,
  )
  if (!allowed) {
    return (
      <div>
        <h1 className="font-bold text-4xl">Too many results</h1>
        <p className="mt-3 text-muted">This network has asked for too many picks. Try again in a minute.</p>
      </div>
    )
  }

  if (!parsed.success) {
    return (
      <div>
        <h1 className="font-bold text-4xl">We need three answers</h1>
        <p className="mt-3 text-muted">Choose a job, a budget, and an experience level. The form works without an account.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Back to the questions
        </Link>
      </div>
    )
  }

  const result = await recommendQuiz(parsed.data)
  if (!result) {
    return (
      <div>
        <h1 className="font-bold text-4xl">No tool in the catalog fits that job yet</h1>
        <p className="mt-3 text-muted">Try a nearby job from the list on the home page.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
          Start over
        </Link>
      </div>
    )
  }

  const [top, ...alternatives] = result.picks
  if (!top) {
    return (
      <div>
        <h1 className="font-bold text-4xl">{fewStrongOptionsLabel}</h1>
        <p className="mt-3 text-muted">Try a nearby job from the list on the home page.</p>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center font-semibold underline">
          Start over
        </Link>
      </div>
    )
  }
  const access = await memberAccess()
  const sharePath = `/result?${new URLSearchParams(parsed.data).toString()}`
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: result.task.name, path: `/best/${result.task.slug}` },
    { name: 'Your result', path: sharePath },
  ]

  return (
    <article className="space-y-10">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">Your pick</p>
      <h1 className="font-bold text-5xl leading-tight">{top.name}</h1>
      <p className="max-w-2xl text-lg">
        Best bot for {result.task.name.toLowerCase()}, {budgetLabel[parsed.data.budget].toLowerCase()}, {skillLabel[parsed.data.skill].toLowerCase()}: {top.name}.
      </p>
      {top.budgetFit === 'over' ? <p className="text-sm font-semibold text-accent">{overBudgetLabel}</p> : null}
      <p className="max-w-2xl text-muted">{top.reason}</p>
      <EditorialCompact editorial={top.editorial} pros={top.pros} cons={top.cons} />
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Price" value={priceLabel(top)} />
        <Fact label="Experience" value={skillLabel[top.skillLevel]} />
        <Fact label="Free tier" value={top.hasFreeTier ? 'Yes' : 'No'} />
      </dl>
      <div className="flex flex-wrap gap-3">
        <OutboundLink slug={top.slug} className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Visit {top.name}
        </OutboundLink>
        <Link href={`/tools/${top.slug}`} className="inline-flex min-h-12 items-center rounded-full border border-ink px-5 font-semibold">
          Read the profile
        </Link>
      </div>

      {access.allowed ? (
        <form action={savePickAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="task" value={parsed.data.task} />
          <input type="hidden" name="budget" value={parsed.data.budget} />
          <input type="hidden" name="skill" value={parsed.data.skill} />
          <button type="submit" className="min-h-12 rounded-full border border-accent px-5 font-medium text-accent">
            Save this pick
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">
          <Link href={access.reason === 'unauthenticated' ? '/sign-in' : '/pricing'} className="font-semibold underline">
            Members
          </Link>{' '}
          can save this pick.
        </p>
      )}

      <section aria-labelledby="alternatives-heading">
        <h2 id="alternatives-heading" className="font-semibold text-3xl">Alternatives</h2>
        {alternatives.length > 0 ? (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {alternatives.map((alt) => (
              <li key={alt.slug} className="rounded-2xl border border-line bg-card p-4">
                <h3 className="font-semibold text-2xl">
                  <Link href={`/tools/${alt.slug}`} className="underline-offset-4 hover:underline">
                    {alt.name}
                  </Link>
                </h3>
                {alt.budgetFit === 'over' ? <p className="mt-2 text-sm font-semibold text-accent">{overBudgetLabel}</p> : null}
                <p className="mt-2 text-sm text-muted">{alt.reason}</p>
                <EditorialCompact editorial={alt.editorial} pros={alt.pros} cons={alt.cons} />
                <p className="mt-2 text-sm">{priceLabel(alt)}</p>
                <OutboundLink slug={alt.slug} className="mt-3 inline-flex min-h-12 items-center font-semibold underline">
                  Visit {alt.name}
                </OutboundLink>
              </li>
            ))}
          </ul>
        ) : null}
        {alternatives.length < QUIZ_ALTERNATIVE_COUNT ? <p className="mt-4 text-muted">{fewStrongOptionsLabel}</p> : null}
        {result.matchCount > 0 ? (
          <p className="mt-4">
            <Link className="font-semibold underline" href={matchesPath(result.task.slug, parsed.data.budget, 1)}>
              {seeAllMatchesLabel(result.matchCount)}
            </Link>
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="font-semibold text-3xl">Side by side</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="sr-only">Comparison of the top pick and alternatives</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3">Tool</th>
                <th scope="col" className="py-2 pr-3">Price</th>
                <th scope="col" className="py-2 pr-3">Experience</th>
                <th scope="col" className="py-2">Fit</th>
              </tr>
            </thead>
            <tbody>
              {result.picks.map((pick) => (
                <tr key={pick.slug} className="border-b border-line">
                  <th scope="row" className="py-3 pr-3 font-semibold">
                    <Link href={`/tools/${pick.slug}`} className="underline">
                      {pick.name}
                    </Link>
                    {pick.budgetFit === 'over' ? (
                      <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-accent">{overBudgetLabel}</span>
                    ) : null}
                  </th>
                  <td className="py-3 pr-3">{priceLabel(pick)}</td>
                  <td className="py-3 pr-3">{skillLabel[pick.skillLevel]}</td>
                  <td className="py-3">{pick.fitScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm text-muted">
        Share this page: <a className="underline" href={absoluteUrl(sharePath)}>{absoluteUrl(sharePath)}</a>
      </p>
      <p className="text-sm text-muted">
        The button goes to the tool’s own site. We are not adding an affiliate code. See the{' '}
        <Link href="/disclosure" className="underline">affiliate disclosure</Link>.
      </p>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-mist px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
