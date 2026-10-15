import { comparisonRows, comparisonSummary } from './compare'
import type { Catalog } from './catalog-types'
import { budgetPhrase, skillPhrase } from './format'
import { TAGLINE } from './site'
import { budgetSchema, parseComparePair, quizSchema, skillSchema, slugSchema } from './validation'

/** CDN caches one card per canonical URL for a day, and may serve it stale for a week. */
export const OG_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=604800'

/** A missing catalog is not a stable "invalid URL". Do not let the CDN remember it. */
export const OG_UNAVAILABLE_CACHE_CONTROL = 'no-store'

export const OG_CANONICAL_PATH = '/api/og'

export const OG_RATE_LIMIT = 60
export const OG_RATE_WINDOW_MS = 60_000
export const OG_DB_BUDGET_MS = 800

export type OgCopy = { title: string; subtitle: string }

const FALLBACK: OgCopy = { title: TAGLINE, subtitle: 'One pick and two alternatives.' }

/**
 * Open Graph copy comes from the catalog. `kind=compare` uses the pair.
 * `kind=result` uses the task, budget, and skill. Free-text titles are only
 * a fallback when no catalog match exists.
 */
export function ogCopy(
  input: {
    kind?: string
    pair?: string
    task?: string
    budget?: string
    skill?: string
    title?: string
    subtitle?: string
  },
  catalog: Catalog,
): OgCopy {
  if (input.kind === 'compare' || (input.pair && input.kind !== 'result')) {
    const parsed = input.pair ? parseComparePair(input.pair) : null
    if (!parsed) return { title: 'Comparison', subtitle: FALLBACK.subtitle }
    const a = catalog.tools.find((tool) => tool.slug === parsed.a)
    const b = catalog.tools.find((tool) => tool.slug === parsed.b)
    if (!a || !b) return { title: 'Comparison', subtitle: FALLBACK.subtitle }
    const rows = comparisonRows(a, b)
    return {
      title: `${a.name} vs ${b.name}`,
      subtitle: rows.length > 0 ? comparisonSummary(a, b, rows) : `${a.shortDesc} ${b.shortDesc}`,
    }
  }

  const taskSlug = slugSchema.safeParse(input.task ?? '')
  if ((input.kind === 'result' || input.kind === 'task' || taskSlug.success) && taskSlug.success) {
    const task = catalog.tasks.find((item) => item.slug === taskSlug.data)
    if (!task) return FALLBACK
    const budget = budgetSchema.safeParse(input.budget ?? '')
    const skill = skillSchema.safeParse(input.skill ?? '')
    const subtitle =
      input.kind === 'result' && budget.success && skill.success
        ? `One pick for ${task.name.toLowerCase()} ${budgetPhrase(budget.data)} for ${skillPhrase(skill.data)}.`
        : task.description
    return { title: `Best AI tool for ${task.name.toLowerCase()}`, subtitle }
  }

  return {
    title: input.title?.trim() || FALLBACK.title,
    subtitle: input.subtitle?.trim() || FALLBACK.subtitle,
  }
}

/**
 * Every preview URL collapses to one cache key.
 * Valid shapes: `/api/og`, `kind=compare&pair=`, `kind=result&task&budget&skill`, `kind=task&task`.
 * Anything else, including free-text titles, returns the default path so the CDN stores one redirect.
 * A missing catalog returns null: the caller serves a fallback image and must not cache a redirect.
 */
export function canonicalOgPath(searchParams: URLSearchParams, catalog: Catalog | null): string | null {
  if (!catalog) return null

  const kind = searchParams.get('kind')
  if (kind === 'compare') {
    const parsed = parseComparePair(searchParams.get('pair') ?? '')
    if (!parsed) return OG_CANONICAL_PATH
    const a = catalog.tools.find((tool) => tool.slug === parsed.a)
    const b = catalog.tools.find((tool) => tool.slug === parsed.b)
    if (!a || !b) return OG_CANONICAL_PATH
    return `${OG_CANONICAL_PATH}?kind=compare&pair=${parsed.a}-vs-${parsed.b}`
  }

  if (kind === 'result') {
    const quiz = quizSchema.safeParse({
      task: searchParams.get('task') ?? '',
      budget: searchParams.get('budget') ?? '',
      skill: searchParams.get('skill') ?? '',
    })
    if (!quiz.success) return OG_CANONICAL_PATH
    if (!catalog.tasks.some((task) => task.slug === quiz.data.task)) return OG_CANONICAL_PATH
    const query = new URLSearchParams({
      kind: 'result',
      task: quiz.data.task,
      budget: quiz.data.budget,
      skill: quiz.data.skill,
    })
    return `${OG_CANONICAL_PATH}?${query.toString()}`
  }

  if (kind === 'task') {
    const slug = slugSchema.safeParse(searchParams.get('task') ?? '')
    if (!slug.success) return OG_CANONICAL_PATH
    if (!catalog.tasks.some((task) => task.slug === slug.data)) return OG_CANONICAL_PATH
    return `${OG_CANONICAL_PATH}?kind=task&task=${slug.data}`
  }

  return OG_CANONICAL_PATH
}
