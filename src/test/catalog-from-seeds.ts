import { taskSeeds, toolSeeds } from '../data/catalog'
import type { Catalog, CatalogTool } from '../lib/catalog-types'

/** In-memory catalog built from the seed module, for tests that should follow the data. */
export function catalogFromSeeds(): Catalog {
  const taskName = new Map(taskSeeds.map((task) => [task.slug, task.name]))
  const tools: CatalogTool[] = toolSeeds.map((tool, index) => ({
    id: index + 1,
    slug: tool.slug,
    name: tool.name,
    vendor: tool.vendor,
    url: tool.url,
    category: tool.category,
    shortDesc: tool.shortDesc,
    longDesc: tool.longDesc,
    pricingModel: tool.pricingModel,
    priceFromUsd: tool.priceFromUsd,
    hasFreeTier: tool.hasFreeTier,
    skillLevel: tool.skillLevel,
    platforms: tool.platforms,
    lastVerifiedAt: tool.lastVerifiedAt,
    fits: tool.fits.map((fit) => ({
      taskSlug: fit.task,
      taskName: taskName.get(fit.task) ?? '',
      score: fit.score,
      notes: fit.notes,
    })),
    affiliate: { ...tool.affiliate, affiliateUrl: null },
  }))
  return { tasks: taskSeeds, tools }
}
