import { and, eq, notInArray, sql } from 'drizzle-orm'

export type RatingWriteCounts = {
  scoresInserted: number
  scoresUpdated: number
  scoresRemoved: number
  prosInserted: number
  prosUpdated: number
  prosRemoved: number
}
import { comparePairSeeds, retiredFitSeeds, taskSeeds, toolSeeds } from '../src/data/catalog'
import { dealSeeds } from '../src/data/deals.seed'
import { editorialSeeds } from '../src/data/scores-pros-cons.seed'
import { ratingSeeds, supplementalProsConsSeeds } from '../src/data/scores-v23.seed'
import { getDb } from '../src/lib/db/client'
import { assertSafeDbTarget } from '../src/lib/db/guard'
import { affiliatePrograms, deals, tasks, toolProsCons, toolScores, toolTasks, toolVendorDomains, tools } from '../src/lib/db/schema'
import { registrableDomain } from '../src/lib/reviews/domain'
import { validateProsConsSeeds, validateRatingSeeds } from '../src/lib/editorial'
import { affiliateSeedValues, isApprovedActiveAffiliate } from '../src/lib/affiliate-admin'
import { reviewedToolUrl } from '../src/lib/redirect'

/** Score rows that are not in the v2.3 file are deleted only when this is exactly `1`. */
export function seedPruneEnabled(value: string | undefined = process.env.SEED_PRUNE): boolean {
  return value === '1'
}

/**
 * Stay under SQLite's default 999-variable limit. The widest row written here
 * has 16 columns, so 40 rows is 640 variables.
 */
const SEED_BATCH = 40

function batches<T>(rows: readonly T[], size = SEED_BATCH): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size))
  return chunks
}

export async function seed(): Promise<RatingWriteCounts> {
for (const tool of toolSeeds) reviewedToolUrl(tool)

assertSafeDbTarget(process.env.TURSO_DATABASE_URL?.trim() ?? 'file:./data/local.db')
const db = getDb()

const knownSlugs = new Set(toolSeeds.map((tool) => tool.slug))
validateRatingSeeds(ratingSeeds, knownSlugs)
validateProsConsSeeds(editorialSeeds, knownSlugs)
validateProsConsSeeds(supplementalProsConsSeeds, knownSlugs)
const pointSeeds = [...editorialSeeds, ...supplementalProsConsSeeds]
const pruneScores = seedPruneEnabled(process.env.SEED_PRUNE)

// One transaction. Catalog rows that are not in this seed stay in place.
// Score rows are upserted. Deleting scores that v2.3 does not rate is opt-in.
// Pros and cons are upserted and never deleted.
const counts: RatingWriteCounts = {
  scoresInserted: 0,
  scoresUpdated: 0,
  scoresRemoved: 0,
  prosInserted: 0,
  prosUpdated: 0,
  prosRemoved: 0,
}
const catalogFitKeys = new Set(toolSeeds.flatMap((tool) => tool.fits.map((fit) => `${tool.slug}\0${fit.task}`)))
await db.transaction(async (tx) => {
for (const batch of batches(taskSeeds)) {
  await tx
    .insert(tasks)
    .values([...batch])
    .onConflictDoUpdate({
      target: tasks.slug,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        description: sql`excluded.description`,
      },
    })
}

const toolRowsToWrite = toolSeeds.map((tool) => ({
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
  status: tool.unlisted ? 'unlisted' : 'active',
  needsVerification: tool.needsVerification === true,
}))
for (const batch of batches(toolRowsToWrite)) {
  await tx
    .insert(tools)
    .values(batch)
    .onConflictDoUpdate({
      target: tools.slug,
      set: {
        name: sql`excluded.name`,
        vendor: sql`excluded.vendor`,
        url: sql`excluded.url`,
        category: sql`excluded.category`,
        shortDesc: sql`excluded.short_desc`,
        longDesc: sql`excluded.long_desc`,
        pricingModel: sql`excluded.pricing_model`,
        priceFromUsd: sql`excluded.price_from_usd`,
        hasFreeTier: sql`excluded.has_free_tier`,
        skillLevel: sql`excluded.skill_level`,
        platforms: sql`excluded.platforms`,
        lastVerifiedAt: sql`excluded.last_verified_at`,
        status: sql`excluded.status`,
        needsVerification: sql`excluded.needs_verification`,
      },
    })
}

const taskRows = await tx.select().from(tasks)
const toolRows = await tx.select().from(tools)
const taskId = new Map(taskRows.map((row) => [row.slug, row.id]))
const toolId = new Map(toolRows.map((row) => [row.slug, row.id]))

for (const [toolSlug, taskSlug] of retiredFitSeeds) {
  const retiredTool = toolId.get(toolSlug)
  const retiredTask = taskId.get(taskSlug)
  if (!retiredTool || !retiredTask) throw new Error(`Unknown retired fit ${toolSlug}/${taskSlug}`)
  if (catalogFitKeys.has(`${toolSlug}\0${taskSlug}`)) {
    throw new Error(`Retired fit ${toolSlug}/${taskSlug} is still in the catalog`)
  }
  await tx.delete(toolTasks).where(and(eq(toolTasks.toolId, retiredTool), eq(toolTasks.taskId, retiredTask)))
}

const fitRows: { toolId: number; taskId: number; fitScore: number; notes: string }[] = []
const affiliateRows: {
  toolId: number
  hasProgram: boolean
  network: string | null
  sourceUrl: string | null
  status: string
  affiliateUrl: string | null
  commissionNote: string | null
  verifiedAt: string
}[] = []
for (const tool of toolSeeds) {
  const id = toolId.get(tool.slug)
  if (!id) throw new Error(`Missing tool id for ${tool.slug}`)
  for (const fit of tool.fits) {
    const task = taskId.get(fit.task)
    if (!task) throw new Error(`Unknown task ${fit.task} on ${tool.slug}`)
    fitRows.push({ toolId: id, taskId: task, fitScore: fit.score, notes: fit.notes })
  }

  const affiliate = affiliateSeedValues(tool)
  affiliateRows.push({
    toolId: id,
    hasProgram: tool.affiliate.hasProgram,
    network: tool.affiliate.network,
    sourceUrl: tool.affiliate.sourceUrl,
    status: affiliate.status,
    affiliateUrl: affiliate.affiliateUrl,
    commissionNote: tool.affiliate.commissionNote,
    verifiedAt: tool.lastVerifiedAt,
  })
}
for (const batch of batches(fitRows)) {
  await tx
    .insert(toolTasks)
    .values(batch)
    .onConflictDoUpdate({
      target: [toolTasks.toolId, toolTasks.taskId],
      set: {
        fitScore: sql`excluded.fit_score`,
        notes: sql`excluded.notes`,
      },
    })
}
for (const batch of batches(affiliateRows)) {
  await tx
    .insert(affiliatePrograms)
    .values(batch)
    .onConflictDoUpdate({
      target: affiliatePrograms.toolId,
      set: {
        hasProgram: sql`excluded.has_program`,
        network: sql`excluded.network`,
        sourceUrl: sql`excluded.source_url`,
        status: sql`excluded.status`,
        affiliateUrl: sql`excluded.affiliate_url`,
        commissionNote: sql`excluded.commission_note`,
        verifiedAt: sql`excluded.verified_at`,
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
counts.scoresRemoved = pruneScores ? [...existingScoreIds].filter((id) => !ratedIdSet.has(id)).length : 0
const scoreRows = []
for (const entry of ratingSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for rating seed ${entry.slug}`)
  scoreRows.push({
    toolId: id,
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
  })
}
for (const batch of batches(scoreRows)) {
  await tx
    .insert(toolScores)
    .values(batch)
    .onConflictDoUpdate({
      target: toolScores.toolId,
      set: {
        features: sql`excluded.features`,
        value: sql`excluded.value`,
        ease: sql`excluded.ease`,
        quality: sql`excluded.quality`,
        overall: sql`excluded.overall`,
        rationale: sql`excluded.rationale`,
        sources: sql`excluded.sources`,
        reviewedAt: sql`excluded.reviewed_at`,
        primaryCategory: sql`excluded.primary_category`,
        categoryRankDisplay: sql`excluded.category_rank_display`,
        tieGroup: sql`excluded.tie_group`,
        note: sql`excluded.note`,
        ratingStatus: sql`excluded.rating_status`,
        quizEligible: sql`excluded.quiz_eligible`,
      },
    })
}
if (pruneScores) {
  await tx.delete(toolScores).where(notInArray(toolScores.toolId, ratedIds))
  const remainingScores = await tx.select({ toolId: toolScores.toolId }).from(toolScores)
  if (remainingScores.length !== ratedIds.length || remainingScores.some((row) => !ratedIdSet.has(row.toolId))) {
    throw new Error('Seed left a score row for a tool that v2.3 does not rate')
  }
}

const pointKeys: string[] = []
for (const entry of pointSeeds) {
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
const pointRows: { toolId: number; kind: string; position: number; body: string; sourceUrl: string }[] = []
for (const entry of pointSeeds) {
  const id = toolId.get(entry.slug)
  if (!id) throw new Error(`Missing tool id for pros and cons ${entry.slug}`)
  entry.pros.forEach((point, index) => pointRows.push({ toolId: id, kind: 'pro', position: index + 1, body: point.text, sourceUrl: point.sourceUrl }))
  entry.cons.forEach((point, index) => pointRows.push({ toolId: id, kind: 'con', position: index + 1, body: point.text, sourceUrl: point.sourceUrl }))
}
for (const batch of batches(pointRows)) {
  await tx
    .insert(toolProsCons)
    .values(batch)
    .onConflictDoUpdate({
      target: [toolProsCons.toolId, toolProsCons.kind, toolProsCons.position],
      set: {
        body: sql`excluded.body`,
        sourceUrl: sql`excluded.source_url`,
      },
    })
}

const now = Date.now()
const domainRows: { toolId: number; domain: string; source: 'tool_url'; createdAt: number }[] = []
for (const tool of toolSeeds) {
  // Unlisted tools (for example Mercury 3) are hidden from the site, so they get no vendor domain.
  if (tool.unlisted) continue
  const id = toolId.get(tool.slug)
  if (!id) throw new Error(`Missing tool id for vendor domain ${tool.slug}`)
  const domain = registrableDomain(tool.url)
  if (!domain) throw new Error(`Tool ${tool.slug} has no registrable domain`)
  // Insert only. A manual row for the same domain stays manual, and old tool_url rows are not deleted.
  domainRows.push({ toolId: id, domain, source: 'tool_url', createdAt: now })
}
for (const batch of batches(domainRows)) {
  await tx.insert(toolVendorDomains).values(batch).onConflictDoNothing()
}

const dealRows = []
for (const deal of dealSeeds) {
  if (!knownSlugs.has(deal.toolSlug)) throw new Error(`Deal ${deal.code} is for unknown tool ${deal.toolSlug}`)
  dealRows.push({ ...deal })
}
for (const batch of batches(dealRows)) {
  await tx
    .insert(deals)
    .values([...batch])
    .onConflictDoUpdate({
      target: [deals.toolSlug, deals.code],
      set: {
        vendor: sql`excluded.vendor`,
        title: sql`excluded.title`,
        discountText: sql`excluded.discount_text`,
        dealUrl: sql`excluded.deal_url`,
        terms: sql`excluded.terms`,
        startsAt: sql`excluded.starts_at`,
        expiresAt: sql`excluded.expires_at`,
        active: sql`excluded.active`,
      },
    })
}

const storedPrograms = await tx.select().from(affiliatePrograms)
const slugByToolId = new Map(toolRows.map((row) => [row.id, row.slug]))
for (const row of storedPrograms) {
  const slug = slugByToolId.get(row.toolId)
  if (!slug) throw new Error('Affiliate program row has no tool')
  if ((row.status === 'active' || row.affiliateUrl) && !isApprovedActiveAffiliate(slug)) {
    throw new Error(`Seed wrote a live affiliate program for ${slug}. That slug is not in APPROVED_ACTIVE_AFFILIATES.`)
  }
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
