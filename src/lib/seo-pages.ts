import { taskSeeds, toolSeeds } from '@/data/catalog'
import { taskGerund } from './descriptions'

/**
 * Head copy for the SEO hub pages (docs/specs/seo-20-pages, pages 9 and 10,
 * plus the /best hub). Counts come from the catalog seed, so the copy follows
 * the data instead of a typed number.
 */
export const CATALOG_TOOL_COUNT = toolSeeds.length
export const CATALOG_TASK_COUNT = taskSeeds.length

export const BEST_HUB_PATH = '/best'
export const BEST_HUB_TITLE = 'Best AI Tools by Job'
export const BEST_HUB_HEADING = 'The best AI tool for every job'
export const BEST_HUB_DESCRIPTION = `Pick a job and see the best AI tool for it, plus the closest alternatives. ${CATALOG_TASK_COUNT} jobs, ${CATALOG_TOOL_COUNT} tools. Or get your own pick in 30 seconds.`

export const LOADOUT_PATH = '/ai-loadout'
export const LOADOUT_PDF_PATH = '/ai-loadout.pdf'
export const LOADOUT_TITLE = `The AI Loadout: The Best AI Tool for All ${CATALOG_TASK_COUNT} Jobs`
export const LOADOUT_HEADING = `The AI Loadout: the best bot for all ${CATALOG_TASK_COUNT} jobs`
export const LOADOUT_DESCRIPTION = `One top pick for each of ${CATALOG_TASK_COUNT} jobs, from writing code to making music, from our catalog of ${CATALOG_TOOL_COUNT} tools. Free one-page PDF. The right AI in 30 seconds.`

/** Spec limits: title ≤ 60 characters, meta description ≤ 155. */
export const SEO_TITLE_MAX = 60
export const SEO_DESCRIPTION_MAX = 155

export type HubRow = {
  taskSlug: string
  taskName: string
  pick: { slug: string; name: string; fitScore: number; notes: string } | null
}

/** One row per task, top pick first-ranked exactly as /best/[task] ranks it. */
export function hubRows(
  tasks: { slug: string; name: string }[],
  rankedByTask: Map<string, { slug: string; name: string; fitScore: number; notes: string }[]>,
): HubRow[] {
  return tasks.map((task) => {
    const top = rankedByTask.get(task.slug)?.[0]
    return {
      taskSlug: task.slug,
      taskName: task.name,
      pick: top ? { slug: top.slug, name: top.name, fitScore: top.fitScore, notes: top.notes } : null,
    }
  })
}

/** "Write code" → "Writing code" for table cells. */
export function jobLabel(taskName: string): string {
  const gerund = taskGerund(taskName)
  return gerund.charAt(0).toUpperCase() + gerund.slice(1)
}

/** "Write code" → "Best Free AI Tool for Writing Code (2026)". The spec's head copy, with the gerund. */
export function bestFreeTitle(taskName: string, year = 2026): string {
  const words = taskGerund(taskName)
    .split(' ')
    .map((word) => (word === 'SEO' ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
  return `Best Free AI Tool for ${words} (${year})`
}

export function bestFreeHeading(taskName: string): string {
  return `Best free AI tool for ${taskGerund(taskName)}`
}

/** The "checked against vendor pages" claim only appears when every note on the page is fresh. */
export function bestFreeDescription(taskName: string, documented: boolean): string {
  const lead = `The best free AI tool for ${taskGerund(taskName)}, plus up to five free alternatives`
  return documented ? `${lead}, with what each free plan includes. Checked against vendor pages.` : `${lead}. Confirm each free plan on the vendor’s site.`
}

export function bestFreePath(taskSlug: string): string {
  return `/best/${taskSlug}/free`
}
