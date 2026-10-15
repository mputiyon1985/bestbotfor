import { comparisonRows, comparisonSummary } from './compare'
import type { Catalog } from './catalog-types'
import { budgetPhrase, skillPhrase } from './format'
import { TAGLINE } from './site'
import { budgetSchema, parseComparePair, skillSchema, slugSchema } from './validation'

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
