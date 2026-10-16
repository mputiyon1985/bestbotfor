import { notInArray } from 'drizzle-orm'

export type RatingWriteCounts = {
  scoresInserted: number
  scoresUpdated: number
  scoresRemoved: number
  prosInserted: number
  prosUpdated: number
  prosRemoved: number
}
import { comparePairSeeds, taskSeeds, toolSeeds } from '../src/data/catalog'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { ratingSeeds } from '../src/data/scores-v23.seed'
import { getDb } from '../src/lib/db/client'
import { affiliatePrograms, tasks, toolProsCons, toolScores, toolTasks, tools } from '../src/lib/db/schema'
import { validateProsConsSeeds, validateRatingSeeds } from '../src/lib/editorial'
import { reviewedToolUrl } from '../src/lib/redirect'

export async function seed(): Promise<RatingWriteCounts> {
for (const tool of toolSeeds) reviewedToolUrl(tool)

const db = getDb()

const knownSlugs = new Set(toolSeeds.map((tool) => tool.slug))
validateRatingSeeds(ratingSeeds, knownSlugs)
validateProsConsSeeds(editorialSeeds, knownSlugs)

// One transaction. Catalog rows that are not in this seed stay in place.
// Score rows stay only for v2.3-rated tools. Pros and cons are upserted and never deleted.
const counts: RatingWriteCounts = {
  scoresInserted: 0,
  scoresUpdated: 0,
  scoresRemoved: 0,
  prosInserted: 0,
  prosUpdated: 0,
  prosRemoved: 0,
}
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
      needsVerification: tool.needsVerification === true,
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
        needsVerification: tool.needsVerification === true,
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

const ratedIds: number[] = []
const ratedIdSet = new Set<number>()
for (const entry of ratingSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for rating seed ${entry.slug}`)
  ratedIds.push(id)
  ratedIdSet.add(id)
}
const existingScores = await tx.select({ toolId: toolScores.toolId }).from(toolScores)
const existingScoreIds = new Set(existingScores.map((row) => row.toolId))
counts.scoresInserted = ratedIds.filter((id) => !existingScoreIds.has(id)).length
counts.scoresUpdated = ratedIds.filter((id) => existingScoreIds.has(id)).length
counts.scoresRemoved = [...existingScoreIds].filter((id) => !ratedIdSet.has(id)).length
for (const entry of ratingSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for rating seed ${entry.slug}`)
  const score = {
    features: entry.features,
    value: entry.value,
    ease: entry.ease,
    quality: entry.quality,
    overall: entry.overall,
    rationale: entry.rationale,
    sources: '[]',
    reviewedAt: entry.reviewedAt,
    primaryCategory: entry.primaryCategory,
    categoryRankDisplay: entry.categoryRankDisplay,
    tieGroup: entry.tieGroup,
    note: entry.note,
    ratingStatus: entry.ratingStatus,
    quizEligible: entry.quizEligible,
  }
  await tx
    .insert(toolScores)
    .values({ toolId: id, ...score })
    .onConflictDoUpdate({
      target: toolScores.toolId,
      set: score,
    })
}
await tx.delete(toolScores).where(notInArray(toolScores.toolId, ratedIds))
const remainingScores = await tx.select({ toolId: toolScores.toolId }).from(toolScores)
if (remainingScores.length !== ratedIds.length || remainingScores.some((row) => !ratedIdSet.has(row.toolId))) {
  throw new Error('Seed left a score row for a tool that v2.3 does not rate')
}

const pointKeys: string[] = []
for (const entry of editorialSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for pros and cons ${entry.slug}`)
  entry.pros.forEach((_, index) => pointKeys.push(`${id}:pro:${index + 1}`))
  entry.cons.forEach((_, index) => pointKeys.push(`${id}:con:${index + 1}`))
}
const existingPoints = await tx
  .select({ toolId: toolProsCons.toolId, kind: toolProsCons.kind, position: toolProsCons.position })
  .from(toolProsCons)
const existingPointKeys = new Set(existingPoints.map((row) => `${row.toolId}:${row.kind}:${row.position}`))
counts.prosInserted = pointKeys.filter((key) => !existingPointKeys.has(key)).length
counts.prosUpdated = pointKeys.filter((key) => existingPointKeys.has(key)).length
counts.prosRemoved = 0
for (const entry of editorialSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for pros and cons ${entry.slug}`)
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

console.log(
  `Seeded ${toolSeeds.length} tools and ${taskSeeds.length} tasks. Scores inserted ${counts.scoresInserted}, updated ${counts.scoresUpdated}, removed ${counts.scoresRemoved}. Pros and cons inserted ${counts.prosInserted}, updated ${counts.prosUpdated}, removed ${counts.prosRemoved}.`,
)
return counts
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('seed.ts') || entry.endsWith('seed.js')) {
  seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed failed')
    process.exit(1)
  })
}
