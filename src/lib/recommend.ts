import type { Catalog, CatalogTask, CatalogTool } from './catalog-types'
import { rankTools, selectQuizPicks, type RankedTool } from './scoring'
import type { QuizAnswers } from './validation'

export type Recommendation = {
  task: CatalogTask
  answers: QuizAnswers
  ranked: RankedTool[]
  picks: Array<RankedTool & { tool: CatalogTool; budgetFit: 'within' | 'over'; reason: string }>
  why: string
}

export function recommend(catalog: Catalog, answers: QuizAnswers): Recommendation | null {
  const task = catalog.tasks.find((item) => item.slug === answers.task)
  if (!task) return null
  const candidates = catalog.tools.flatMap((tool) => {
    const fit = tool.fits.find((item) => item.taskSlug === task.slug)
    if (!fit) return []
    return [
      {
        slug: tool.slug,
        name: tool.name,
        skillLevel: tool.skillLevel,
        pricingModel: tool.pricingModel,
        hasFreeTier: tool.hasFreeTier,
        priceFromUsd: tool.priceFromUsd,
        fitScore: fit.score,
        notes: fit.notes,
      },
    ]
  })
  const ranked = rankTools(candidates, answers)
  const picks = selectQuizPicks(candidates, answers).flatMap((rankedTool) => {
    const tool = catalog.tools.find((item) => item.slug === rankedTool.slug)
    return tool ? [{ ...rankedTool, tool }] : []
  })
  const leader = picks[0]
  return {
    task,
    answers,
    ranked,
    picks,
    why: leader ? leader.reason : '',
  }
}

export function toolsForTask(catalog: Catalog, taskSlug: string): Array<CatalogTool & { fitScore: number; notes: string }> {
  return catalog.tools
    .flatMap((tool) => {
      const fit = tool.fits.find((item) => item.taskSlug === taskSlug)
      if (!fit) return []
      return [{ ...tool, fitScore: fit.score, notes: fit.notes }]
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.name.localeCompare(b.name))
}

export function searchTools(catalog: Catalog, query: string): CatalogTool[] {
  const needle = query.toLowerCase()
  return catalog.tools.filter((tool) => {
    const haystack = [tool.name, tool.vendor, tool.category, tool.shortDesc, ...tool.fits.map((fit) => fit.taskName)]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}
