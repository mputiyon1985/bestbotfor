import type { EditorialScore, ProCon } from './editorial'
import type { Skill } from './validation'

export type PricingModel = 'free' | 'freemium' | 'paid'

export type AffiliateStatus = 'none' | 'verify' | 'referral' | 'available' | 'closed'

export type AffiliateSeed = {
  hasProgram: boolean
  network: string | null
  sourceUrl: string | null
  status: AffiliateStatus
  commissionNote: string | null
  /**
   * Reviewed affiliate link shipped in code. Used by /go only when the DB has no
   * affiliate_url, and only if it passes the tool's allowedHosts. The seed script
   * still never writes it to the DB.
   */
  affiliateUrl?: string
}

/**
 * Free-plan catalog fields for /best/[task]/free. All three are required for a
 * tool to count as documented; see src/lib/free-plan.ts for the index rule.
 */
export type FreePlanFields = {
  /** One or two sentences on what the free plan includes and its key limits. */
  freePlanNote: string
  /** The vendor's own pricing or plan page (https). */
  freePlanSource: string
  /** ISO date (YYYY-MM-DD, ET) the source was last checked. */
  freePlanCheckedAt: string
}

export type TaskSeed = {
  slug: string
  name: string
  category: string
  description: string
}

export type ToolSeed = {
  slug: string
  name: string
  vendor: string
  url: string
  /** Exact public hosts this tool may redirect to. Reviewed with the seed. */
  allowedHosts: readonly string[]
  category: string
  shortDesc: string
  longDesc: string
  pricingModel: PricingModel
  priceFromUsd: number | null
  hasFreeTier: boolean
  skillLevel: Skill
  platforms: string[]
  lastVerifiedAt: string
  fits: { task: string; score: number; notes: string }[]
  affiliate: AffiliateSeed
  /** The public name and URL still need a fresh check. No editorial score is shown. */
  needsVerification?: boolean
  /**
   * Kept in the catalog seed but left off every public surface: the seed writes
   * tools.status = 'unlisted', so site pages, search, the quiz and the sitemap
   * (all filter status = 'active') skip it, and /go/<slug> answers 404.
   */
  unlisted?: boolean
}

export type CatalogTask = TaskSeed

export type CatalogFit = {
  taskSlug: string
  taskName: string
  score: number
  notes: string
}

export type CatalogTool = {
  id: number
  slug: string
  name: string
  vendor: string
  url: string
  category: string
  shortDesc: string
  longDesc: string
  pricingModel: PricingModel
  priceFromUsd: number | null
  hasFreeTier: boolean
  skillLevel: Skill
  platforms: string[]
  lastVerifiedAt: string
  fits: CatalogFit[]
  affiliate: Omit<AffiliateSeed, 'affiliateUrl'> & { affiliateUrl: string | null }
  /** Null when this tool has no verified editorial score. */
  editorial: EditorialScore | null
  pros: ProCon[]
  cons: ProCon[]
  /** False excludes the tool from quiz picks and alternatives. Pages stay live. */
  quizEligible: boolean
}

export type Catalog = {
  tasks: CatalogTask[]
  tools: CatalogTool[]
}
