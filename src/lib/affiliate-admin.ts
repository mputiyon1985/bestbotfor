import type { AffiliateStatus, ToolSeed } from './catalog-types'

/** The only status that may send a Visit click to affiliate_programs.affiliate_url. */
export const ACTIVE_AFFILIATE_STATUS = 'active' satisfies AffiliateStatus

/**
 * Slugs the owner has approved to go live. The seed writes an affiliate URL
 * only for these slugs, and only when that tool's status is "active".
 * Every other program is refused if it is active or carries a tracking link.
 */
/**
 * Owner-approved live programs. Writesonic stays off. Lovable stays off:
 * Impact declined that partnership on Oct 27.
 */
export const APPROVED_ACTIVE_AFFILIATES: readonly string[] = [
  'elevenlabs',
  'synthesia',
  'descript',
  'murf',
  'papermark',
  'docsalot',
]

/** Prepared programs. A slug here is live only when it is also in APPROVED_ACTIVE_AFFILIATES. */
export const PREPARED_AFFILIATE_SLUGS = [
  'elevenlabs',
  'synthesia',
  'descript',
  'murf',
  'papermark',
  'docsalot',
  'writesonic',
  'lovable',
] as const

export type PreparedAffiliateSlug = (typeof PREPARED_AFFILIATE_SLUGS)[number]

export function isApprovedActiveAffiliate(slug: string): boolean {
  return APPROVED_ACTIVE_AFFILIATES.includes(slug)
}

export function isPreparedAffiliateSlug(slug: string): slug is PreparedAffiliateSlug {
  return (PREPARED_AFFILIATE_SLUGS as readonly string[]).includes(slug)
}

/**
 * What the seed may write for one tool. An unapproved program cannot be
 * active and cannot carry an affiliate URL. An approved one must be both.
 */
export function affiliateSeedValues(tool: Pick<ToolSeed, 'slug' | 'affiliate'>): {
  status: AffiliateStatus
  affiliateUrl: string | null
} {
  const approved = isApprovedActiveAffiliate(tool.slug)
  const url = tool.affiliate.affiliateUrl?.trim() ? tool.affiliate.affiliateUrl : null
  if (tool.affiliate.status === ACTIVE_AFFILIATE_STATUS && !approved) {
    throw new Error(`${tool.slug}: refusing to seed status active without owner approval`)
  }
  if (url && !approved) {
    throw new Error(`${tool.slug}: refusing to seed an affiliate URL without owner approval`)
  }
  if (approved && tool.affiliate.status !== ACTIVE_AFFILIATE_STATUS) {
    throw new Error(`${tool.slug}: an approved program must use status active`)
  }
  if (approved && !url) {
    throw new Error(`${tool.slug}: an approved program needs an affiliate URL`)
  }
  return {
    status: tool.affiliate.status,
    affiliateUrl: approved ? url : null,
  }
}

export type AffiliateAdminRow = {
  slug: string
  name: string
  status: AffiliateStatus
  network: string | null
  sourceUrl: string | null
  hasUrl: boolean
  prepared: boolean
}

/** Read-only rows for the admin list. The tracking URL itself is not included. */
export function affiliateAdminRows(tools: readonly Pick<ToolSeed, 'slug' | 'name' | 'affiliate'>[]): AffiliateAdminRow[] {
  return tools
    .filter((tool) => tool.affiliate.hasProgram || isPreparedAffiliateSlug(tool.slug))
    .map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      status: tool.affiliate.status,
      network: tool.affiliate.network,
      sourceUrl: tool.affiliate.sourceUrl,
      hasUrl: Boolean(tool.affiliate.affiliateUrl),
      prepared: isPreparedAffiliateSlug(tool.slug),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
}
