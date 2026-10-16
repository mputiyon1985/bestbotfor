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
  affiliate: AffiliateSeed & { affiliateUrl: string | null }
  /** Null when this tool has no verified editorial score. */
  editorial: EditorialScore | null
  pros: ProCon[]
  cons: ProCon[]
}

export type Catalog = {
  tasks: CatalogTask[]
  tools: CatalogTool[]
}
