import type { Metadata } from 'next'
import Link from 'next/link'
import { cache } from 'react'
import { headers } from 'next/headers'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { JsonLd } from '@/components/json-ld'
import { OutboundLink } from '@/components/outbound-link'
import { ToolLogo } from '@/components/tool-logo'
import { EditorialCompact } from '@/components/editorial'
import { recommendQuiz } from '@/lib/catalog'
import { matchBudgetLabel, matchesPath, seeAllMatchesLabel } from '@/lib/matches'
import { allMatchesRequest, resultRequestStatus, searchParamsToUrl } from '@/lib/result-request'
import { resultMissMetadata } from '@/lib/result-http'
import { matchesPageTitle, matchesRobots, quizResultRobots, quizResultTitle } from '@/lib/result-index'
import { AllMatches } from './all-matches'
import NotFoundPage from '../not-found'
import { getDb } from '@/lib/db'
import { budgetLabel, budgetPhrase, fewStrongOptionsLabel, overBudgetLabel, priceLabel, skillLabel, skillPhrase } from '@/lib/format'
import { QUIZ_ALTERNATIVE_COUNT } from '@/lib/scoring'
import { breadcrumbJsonLd } from '@/lib/jsonld'
import { memberAccess } from '@/lib/members'
import { pageMetadata } from '@/lib/metadata'
import { absoluteUrl } from '@/lib/site'
import { firstString, quizSchema, type QuizAnswers } from '@/lib/validation'
import { savePickAction } from './actions'

type LoadedMatches = NonNullable<Awaited<ReturnType<typeof allMatchesRequest>>>
type QuizResult = NonNullable<Awaited<ReturnType<typeof recommendQuiz>>>

type ResultLoad =
  | { kind: 'miss' }
  | { kind: 'form' }
  | { kind: 'matches'; loaded: LoadedMatches }
  | { kind: 'quiz'; answers: QuizAnswers; result: QuizResult }

const loadResult = cache(async function loadResult(key: string): Promise<ResultLoad> {
  const params = Object.fromEntries(new URLSearchParams(key))
  const view = firstString(params.view)
  const query = searchParamsToUrl(params)
  if (view === 'all') {
    const loaded = await allMatchesRequest(getDb(), query)
    if (!loaded) return { kind: 'miss' }
    return { kind: 'matches', loaded }
  }
  if (view !== '') return { kind: 'miss' }
  const parsed = quizSchema.safeParse({
    task: firstString(params.task),
    budget: firstString(params.budget),
    skill: firstString(params.skill),
  })
  if (!parsed.success) {
    if ((await resultRequestStatus(getDb(), query)) === 'not-found') return { kind: 'miss' }
    return { kind: 'form' }
  }
  const [status, result] = await Promise.all([resultRequestStatus(getDb(), query), recommendQuiz(parsed.data)])
  if (status === 'not-found' || !result) return { kind: 'miss' }
  return { kind: 'quiz', answers: parsed.data, result }
})

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const loaded = await loadResult(searchParamsToUrl(await searchParams).toString())
  if (loaded.kind === 'miss') return resultMissMetadata()
  if (loaded.kind === 'form') {
    return pageMetadata({
      title: 'Your result',
      description: 'Answer three questions (task, budget, experience) and get the right AI tool for the job plus up to six alternatives, in about 30 seconds.',
      path: '/result',
      noIndex: true,
    })
  }
  if (loaded.kind === 'matches') {
    const { loaded: matches } = loaded
    const path = matchesPath(matches.task.slug, matches.budget, matches.page)
    const robots = matchesRobots(matches.budget)
    const title = matchesPageTitle(matches.task.name, matches.budget, matches.page)
    return pageMetadata({
      title,
      description: `${matches.total} tools with a strong fit for ${matches.task.name}, ranked for ${matchBudgetLabel[matches.budget].toLowerCase()}.`,
      path,
      noIndex: !robots.index,
      follow: robots.follow,
      pagination: {
        previous: matches.page > 1 ? matchesPath(matches.task.slug, matches.budget, matches.page - 1) : null,
        next: matches.page < matches.pageCount ? matchesPath(matches.task.slug, matches.budget, matches.page + 1) : null,
      },
    })
  }
  const { answers, result } = loaded
  const pick = result.picks[0]
  const title = pick ? quizResultTitle(result.task.name, pick.name) : 'Your result'
  const description = pick
    ? `${pick.name} is the top pick for ${result.task.name.toLowerCase()} ${budgetPhrase(answers.budget)} for ${skillPhrase(answers.skill)}.`
    : 'No matching tools for that combination.'
  const query = new URLSearchParams(answers).toString()
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
  const loaded = await loadResult(searchParamsToUrl(params).toString())
  const headerStore = await headers()
  const nonce = headerStore.get('x-nonce')
  if (loaded.kind === 'miss') return <NotFoundPage />
  if (loaded.kind === 'matches') {
    return (
      <AllMatches
        task={loaded.loaded.task}
        budget={loaded.loaded.budget}
        page={loaded.loaded.page}
        pageCount={loaded.loaded.pageCount}
        total={loaded.loaded.total}
        tools={loaded.loaded.tools}
        nonce={nonce}
      />
    )
  }
  if (loaded.kind === 'form') {
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

  const { answers, result } = loaded
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
  const sharePath = `/result?${new URLSearchParams(answers).toString()}`
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: result.task.name, path: `/best/${result.task.slug}` },
    { name: 'Your result', path: sharePath },
  ]

  return (
    <article className="min-w-0 space-y-10 break-words">
      <JsonLd data={breadcrumbJsonLd(crumbs)} nonce={nonce} />
      <Breadcrumbs items={crumbs} />
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">Your pick</p>
      <div className="flex min-w-0 items-start gap-3">
        <ToolLogo name={top.name} slug={top.slug} />
        <h1 className="min-w-0 font-bold text-5xl leading-tight break-words">{top.name}</h1>
      </div>
      <p className="max-w-2xl text-lg">
        Best bot for {result.task.name.toLowerCase()}, {budgetLabel[answers.budget].toLowerCase()}, {skillLabel[answers.skill].toLowerCase()}: {top.name}.
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
          <input type="hidden" name="task" value={answers.task} />
          <input type="hidden" name="budget" value={answers.budget} />
          <input type="hidden" name="skill" value={answers.skill} />
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
                <div className="flex min-w-0 items-start gap-3">
                  <ToolLogo name={alt.name} slug={alt.slug} />
                  <h3 className="min-w-0 font-semibold text-2xl">
                    <Link href={`/tools/${alt.slug}`} className="underline-offset-4 hover:underline">
                      {alt.name}
                    </Link>
                  </h3>
                </div>
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
            <Link className="font-semibold underline" href={matchesPath(result.task.slug, answers.budget, 1)}>
              {seeAllMatchesLabel(result.matchCount)}
            </Link>
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="font-semibold text-3xl">Side by side</h2>
        <ul className="mt-4 grid gap-3 md:hidden">
          {result.picks.map((pick) => (
            <li key={pick.slug} className="min-w-0 rounded-2xl border border-line p-4">
              <h3 className="font-semibold text-xl">
                <Link href={`/tools/${pick.slug}`} className="inline-flex min-h-12 items-center break-words underline">
                  {pick.name}
                </Link>
              </h3>
              {pick.budgetFit === 'over' ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">{overBudgetLabel}</p>
              ) : null}
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="font-semibold">Price</dt>
                <dd className="break-words">{priceLabel(pick)}</dd>
                <dt className="font-semibold">Experience</dt>
                <dd>{skillLabel[pick.skillLevel]}</dd>
                <dt className="font-semibold">Fit</dt>
                <dd>{pick.fitScore}</dd>
              </dl>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden min-w-0 max-w-full md:block">
          <table className="w-full table-fixed border-collapse text-left text-sm">
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
                  <th scope="row" className="break-words py-3 pr-3 font-semibold">
                    <Link href={`/tools/${pick.slug}`} className="underline">
                      {pick.name}
                    </Link>
                    {pick.budgetFit === 'over' ? (
                      <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-accent">{overBudgetLabel}</span>
                    ) : null}
                  </th>
                  <td className="break-words py-3 pr-3">{priceLabel(pick)}</td>
                  <td className="break-words py-3 pr-3">{skillLabel[pick.skillLevel]}</td>
                  <td className="py-3">{pick.fitScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="min-w-0 text-sm break-words text-muted">
        Share this page:{' '}
        <a className="underline [overflow-wrap:anywhere]" href={absoluteUrl(sharePath)}>{absoluteUrl(sharePath)}</a>
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
