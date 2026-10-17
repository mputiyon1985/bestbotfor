/**
 * Reviewed production update for the A2 catalog corrections.
 *
 * Not called by seed, prebuild, CI, or the app. Do not run until Mark approves.
 * A production deploy's prebuild seed writes the same tool rows and pros from
 * the catalog files. Approving that deploy applies these corrections too.
 * This script is the targeted alternative when you do not want a full reseed.
 *
 *   APPLY_A2_CATALOG_CORRECTIONS=1 TURSO_DATABASE_URL=... npx tsx scripts/a2-catalog-corrections.ts
 *
 * The n8n price label is not a database column. Cloud prices are in euros, so
 * `priceLabel` reads it from code. n8n stays has_free_tier = true because the
 * self-hosted Community Edition is free. There is no free cloud plan.
 */
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { toolSeeds } from '../src/data/catalog'
import {
  DEEPGRAM_PRICE_PRO,
  DEEPGRAM_PRICE_PRO_STALE,
  N8N_PRICE_LABEL,
} from '../src/data/catalog-corrections'
import { getDb } from '../src/lib/db/client'
import { assertSafeDbTarget } from '../src/lib/db/guard'
import { toolProsCons, tools } from '../src/lib/db/schema'

const SLUGS = ['synthesia', 'n8n', 'deepgram'] as const

export function a2CorrectionPlan() {
  return {
    n8nPriceLabel: N8N_PRICE_LABEL,
    n8nPriceLabelStoredInDb: false,
    deepgramPro: { from: DEEPGRAM_PRICE_PRO_STALE, to: DEEPGRAM_PRICE_PRO },
    tools: SLUGS.map((slug) => {
      const tool = toolSeeds.find((item) => item.slug === slug)
      if (!tool) throw new Error(`Missing catalog seed for ${slug}`)
      return {
        slug,
        pricingModel: tool.pricingModel,
        hasFreeTier: tool.hasFreeTier,
        priceFromUsd: tool.priceFromUsd,
        lastVerifiedAt: tool.lastVerifiedAt,
        longDesc: tool.longDesc,
      }
    }),
  }
}

async function main(): Promise<void> {
  const plan = a2CorrectionPlan()
  console.log(JSON.stringify(plan, null, 2))
  if (process.env.APPLY_A2_CATALOG_CORRECTIONS !== '1') {
    console.error("Refusing to write. This script needs Mark's approval. Set APPLY_A2_CATALOG_CORRECTIONS=1 to apply it.")
    process.exit(1)
  }
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) {
    console.error('Set TURSO_DATABASE_URL.')
    process.exit(1)
  }
  assertSafeDbTarget(url)
  const db = getDb()
  await db.transaction(async (tx) => {
    for (const tool of plan.tools) {
      const updated = await tx
        .update(tools)
        .set({
          pricingModel: tool.pricingModel,
          hasFreeTier: tool.hasFreeTier,
          priceFromUsd: tool.priceFromUsd,
          lastVerifiedAt: tool.lastVerifiedAt,
          longDesc: tool.longDesc,
        })
        .where(eq(tools.slug, tool.slug))
        .returning({ slug: tools.slug })
      if (updated.length !== 1) throw new Error(`Expected to update 1 ${tool.slug} row, updated ${updated.length}.`)
    }

    const deepgram = await tx.select({ id: tools.id }).from(tools).where(eq(tools.slug, 'deepgram'))
    const id = deepgram[0]?.id
    if (!id) throw new Error('Deepgram row missing after the tool update.')
    const points = await tx.select().from(toolProsCons).where(eq(toolProsCons.toolId, id))
    const stale = points.filter((row) => row.body === DEEPGRAM_PRICE_PRO_STALE)
    const fresh = points.filter((row) => row.body === DEEPGRAM_PRICE_PRO)
    if (stale.length === 0 && fresh.length === 0) {
      throw new Error('Deepgram price pro was neither the stale line nor the corrected line. No pro was changed.')
    }
    for (const row of stale) {
      await tx
        .update(toolProsCons)
        .set({ body: DEEPGRAM_PRICE_PRO })
        .where(and(eq(toolProsCons.toolId, row.toolId), eq(toolProsCons.kind, row.kind), eq(toolProsCons.position, row.position)))
    }
    console.log(`Deepgram price pro: updated ${stale.length}, already current ${fresh.length}.`)
  })
  console.log('A2 catalog corrections applied.')
}

const entry = process.argv[1]
const invokedDirectly = entry
  ? entry.endsWith(`${path.sep}a2-catalog-corrections.ts`) || entry.endsWith(`${path.sep}a2-catalog-corrections.js`)
  : false

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'A2 catalog correction failed')
    process.exit(1)
  })
}
