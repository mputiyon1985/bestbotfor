import 'server-only'

import { unstable_cache } from 'next/cache'
import { asc } from 'drizzle-orm'
import type { Catalog, CatalogTask, CatalogTool, PricingModel } from './catalog-types'
import { getDb } from './db'
import { affiliatePrograms, tasks, toolTasks, tools } from './db/schema'
import type { Skill } from './validation'
import { z } from 'zod'

const pricingSchema = z.enum(['free', 'freemium', 'paid'])
const skillSchema = z.enum(['beginner', 'intermediate', 'pro'])
const platformSchema = z.array(z.string())

async function loadCatalog(): Promise<Catalog> {
  const db = getDb()
  const [taskRows, toolRows, fitRows, affiliateRows] = await Promise.all([
    db.select().from(tasks).orderBy(asc(tasks.name)),
    db.select().from(tools).orderBy(asc(tools.name)),
    db.select().from(toolTasks),
    db.select().from(affiliatePrograms),
  ])

  const taskById = new Map(taskRows.map((task) => [task.id, task]))
  const affiliateByTool = new Map(affiliateRows.map((row) => [row.toolId, row]))

  const catalogTasks: CatalogTask[] = taskRows.map((task) => ({
    slug: task.slug,
    name: task.name,
    category: task.category,
    description: task.description,
  }))

  const catalogTools: CatalogTool[] = toolRows
    .filter((tool) => tool.status === 'active')
    .map((tool) => {
      const affiliate = affiliateByTool.get(tool.id)
      const fits = fitRows
        .filter((fit) => fit.toolId === tool.id)
        .map((fit) => {
          const task = taskById.get(fit.taskId)
          return {
            taskSlug: task?.slug ?? '',
            taskName: task?.name ?? '',
            score: fit.fitScore,
            notes: fit.notes,
          }
        })
        .filter((fit) => fit.taskSlug)
        .sort((a, b) => b.score - a.score || a.taskName.localeCompare(b.taskName))

      let parsedPlatforms: unknown
      try {
        parsedPlatforms = JSON.parse(tool.platforms)
      } catch {
        parsedPlatforms = []
      }
      const platforms = platformSchema.safeParse(parsedPlatforms)
      return {
        id: tool.id,
        slug: tool.slug,
        name: tool.name,
        vendor: tool.vendor,
        url: tool.url,
        category: tool.category,
        shortDesc: tool.shortDesc,
        longDesc: tool.longDesc,
        pricingModel: pricingSchema.parse(tool.pricingModel) as PricingModel,
        priceFromUsd: tool.priceFromUsd,
        hasFreeTier: tool.hasFreeTier,
        skillLevel: skillSchema.parse(tool.skillLevel) as Skill,
        platforms: platforms.success ? platforms.data : [],
        lastVerifiedAt: tool.lastVerifiedAt,
        fits,
        affiliate: {
          hasProgram: affiliate?.hasProgram ?? false,
          network: affiliate?.network ?? null,
          sourceUrl: affiliate?.sourceUrl ?? null,
          status: (affiliate?.status ?? 'none') as CatalogTool['affiliate']['status'],
          commissionNote: affiliate?.commissionNote ?? null,
          affiliateUrl: affiliate?.affiliateUrl ?? null,
        },
      }
    })

  return { tasks: catalogTasks, tools: catalogTools }
}

export const getCatalog = unstable_cache(loadCatalog, ['catalog-v2'], { revalidate: 3600 })

export async function getTool(slug: string): Promise<CatalogTool | undefined> {
  const catalog = await getCatalog()
  return catalog.tools.find((tool) => tool.slug === slug)
}

export async function getTask(slug: string): Promise<CatalogTask | undefined> {
  const catalog = await getCatalog()
  return catalog.tasks.find((task) => task.slug === slug)
}
