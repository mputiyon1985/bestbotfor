import { comparePairSeeds, taskSeeds, toolSeeds } from '../src/data/catalog'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { getDb } from '../src/lib/db/client'
import { affiliatePrograms, tasks, toolProsCons, toolScores, toolTasks, tools } from '../src/lib/db/schema'
import { validateEditorialSeeds } from '../src/lib/editorial'
import { reviewedToolUrl } from '../src/lib/redirect'

export async function seed(): Promise<void> {
for (const tool of toolSeeds) reviewedToolUrl(tool)

const db = getDb()

validateEditorialSeeds(editorialSeeds, new Set(toolSeeds.map((tool) => tool.slug)))

// One transaction, upserts only. Rows that are not in this seed stay in place.
await db.transaction(async (tx) => {
for (const task of taskSeeds) {
  await tx
    .insert(tasks)
    .values(task)
    .onConflictDoUpdate({
      target: tasks.slug,
      set: { name: task.name, category: task.category, description: task.description },
    })
}

for (const tool of toolSeeds) {
  await tx
    .insert(tools)
    .values({
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
      platforms: JSON.stringify(tool.platforms),
      lastVerifiedAt: tool.lastVerifiedAt,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: tools.slug,
      set: {
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
        platforms: JSON.stringify(tool.platforms),
        lastVerifiedAt: tool.lastVerifiedAt,
        status: 'active',
      },
    })
}

const taskRows = await tx.select().from(tasks)
const toolRows = await tx.select().from(tools)
const taskId = new Map(taskRows.map((row) => [row.slug, row.id]))
const toolId = new Map(toolRows.map((row) => [row.slug, row.id]))

for (const tool of toolSeeds) {
  const id = toolId.get(tool.slug)
  if (!id) throw new Error(`Missing tool id for ${tool.slug}`)
  for (const fit of tool.fits) {
    const task = taskId.get(fit.task)
    if (!task) throw new Error(`Unknown task ${fit.task} on ${tool.slug}`)
    await tx
      .insert(toolTasks)
      .values({
        toolId: id,
        taskId: task,
        fitScore: fit.score,
        notes: fit.notes,
      })
      .onConflictDoUpdate({
        target: [toolTasks.toolId, toolTasks.taskId],
        set: {
          fitScore: fit.score,
          notes: fit.notes,
        },
      })
  }

  await tx
    .insert(affiliatePrograms)
    .values({
      toolId: id,
      hasProgram: tool.affiliate.hasProgram,
      network: tool.affiliate.network,
      sourceUrl: tool.affiliate.sourceUrl,
      status: tool.affiliate.status,
      affiliateUrl: null,
      commissionNote: tool.affiliate.commissionNote,
      verifiedAt: tool.lastVerifiedAt,
    })
    .onConflictDoUpdate({
      target: affiliatePrograms.toolId,
      set: {
        hasProgram: tool.affiliate.hasProgram,
        network: tool.affiliate.network,
        sourceUrl: tool.affiliate.sourceUrl,
        status: tool.affiliate.status,
        affiliateUrl: null,
        commissionNote: tool.affiliate.commissionNote,
        verifiedAt: tool.lastVerifiedAt,
      },
    })
}

for (const [a, b] of comparePairSeeds) {
  if (!toolId.has(a) || !toolId.has(b)) throw new Error(`Compare pair ${a} vs ${b} is not in the catalog`)
}

for (const entry of editorialSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for editorial seed ${entry.slug}`)
  const score = {
    features: entry.features,
    value: entry.value,
    ease: entry.ease,
    quality: entry.quality,
    overall: entry.overall,
    rationale: entry.rationale,
    sources: JSON.stringify(entry.sources),
    reviewedAt: entry.reviewedAt,
  }
  await tx
    .insert(toolScores)
    .values({ toolId: id, ...score })
    .onConflictDoUpdate({
      target: toolScores.toolId,
      set: score,
    })

  const points = [
    ...entry.pros.map((point, index) => ({ kind: 'pro', position: index + 1, body: point.text, sourceUrl: point.sourceUrl })),
    ...entry.cons.map((point, index) => ({ kind: 'con', position: index + 1, body: point.text, sourceUrl: point.sourceUrl })),
  ]
  for (const point of points) {
    await tx
      .insert(toolProsCons)
      .values({ toolId: id, ...point })
      .onConflictDoUpdate({
        target: [toolProsCons.toolId, toolProsCons.kind, toolProsCons.position],
        set: { body: point.body, sourceUrl: point.sourceUrl },
      })
  }
}

const storedPrograms = await tx.select().from(affiliatePrograms)
if (storedPrograms.some((row) => row.affiliateUrl)) {
  throw new Error('Seed wrote an affiliate URL. Redirects must stay on official sites.')
}
})

console.log(`Seeded ${toolSeeds.length} tools and ${taskSeeds.length} tasks. Affiliate URLs left null.`)
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('seed.ts') || entry.endsWith('seed.js')) {
  seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed failed')
    process.exit(1)
  })
}
