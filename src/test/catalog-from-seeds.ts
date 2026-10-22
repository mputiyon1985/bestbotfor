import { taskSeeds, toolSeeds } from '../data/catalog'
import { editorialSeeds } from '../data/scores-pros-cons.seed'
import { ratingSeeds, supplementalProsConsSeeds } from '../data/scores-v23.seed'
import type { Catalog, CatalogTool } from '../lib/catalog-types'
import {
  categoryToolCounts,
  hidesCategoryRank,
  sharesTieGroup,
  tieGroupCounts,
  type ProCon,
} from '../lib/editorial'

const categoryCounts = categoryToolCounts(ratingSeeds)
const tieCounts = tieGroupCounts(ratingSeeds)
const ratingBySlug = new Map(ratingSeeds.map((row) => [row.slug, row]))
const pointsBySlug = new Map([...editorialSeeds, ...supplementalProsConsSeeds].map((row) => [row.slug, row]))

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
    ...(tool.needsVerification ? { editorial: null, pros: [], cons: [], quizEligible: true } : editorialFor(tool.slug)),
  }))
  return { tasks: taskSeeds, tools }
}

function editorialFor(slug: string): Pick<CatalogTool, 'editorial' | 'pros' | 'cons' | 'quizEligible'> {
  const entry = ratingBySlug.get(slug)
  const points = pointsBySlug.get(slug)
  const pros: ProCon[] = (points?.pros ?? []).map((point) => ({ kind: 'pro', text: point.text, sourceUrl: point.sourceUrl }))
  const cons: ProCon[] = (points?.cons ?? []).map((point) => ({ kind: 'con', text: point.text, sourceUrl: point.sourceUrl }))
  if (!entry) return { editorial: null, pros, cons, quizEligible: true }
  return {
    editorial: {
      features: entry.features,
      value: entry.value,
      ease: entry.ease,
      quality: entry.quality,
      overall: entry.overall,
      rationale: entry.rationale,
      reviewedAt: entry.reviewedAt,
      primaryCategory: entry.primaryCategory,
      categoryRankDisplay: entry.categoryRankDisplay,
      tieGroup: entry.tieGroup,
      tied: sharesTieGroup(entry.tieGroup, tieCounts),
      hideRank: hidesCategoryRank(entry.primaryCategory, categoryCounts),
      note: entry.note,
      ratingStatus: entry.ratingStatus,
      quizEligible: entry.quizEligible,
    },
    pros,
    cons,
    quizEligible: entry.quizEligible,
  }
}

/** The catalog as the site serves it: unlisted tools (Mercury 3) keep a DB record but never reach public pages. */
export function listedCatalogFromSeeds(): Catalog {
  const catalog = catalogFromSeeds()
  const unlisted = new Set(toolSeeds.filter((tool) => tool.unlisted).map((tool) => tool.slug))
  return { ...catalog, tools: catalog.tools.filter((tool) => !unlisted.has(tool.slug)) }
}
