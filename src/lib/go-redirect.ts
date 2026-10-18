import { toolSeeds } from '@/data/catalog'
import { isUnsafeCatalogSlug } from './catalog-path'
import { isDeadline, withDeadline } from './deadline'
import { countryCode, hashIp, sameOriginPath } from './ip'
import { decideRedirect } from './redirect'
import { slugSchema } from './validation'

export const GO_DB_BUDGET_MS = 800

export type GoClick = {
  toolId: number
  page: string
  country: string | null
  ipHash: string | null
}

export type GoToolRecord = {
  id: number
  url: string
  affiliateUrl: string | null
}

export type GoOutcome =
  | { status: 302; location: string; click: GoClick | null }
  | { status: 404 | 429; body: string }

const NOT_A_TOOL = 'That address is not a tool in the catalog.'
const NOT_IN_CATALOG = 'That tool is not in the catalog.'

/**
 * HEAD probes use the reviewed seed URL and do not call the rate limiter or
 * the catalog. A timeout on either of those logs an error from the GET path,
 * and a probe does not need a click row. The destination is the same official
 * URL a catalog timeout uses. Affiliate URLs and request query strings are
 * not read.
 */
export function resolveHeadGoRedirect(slug: string): GoOutcome {
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) {
    return { status: 404, body: NOT_A_TOOL }
  }
  const reviewed = toolSeeds.find((item) => item.slug === slug)
  if (!reviewed) return { status: 404, body: NOT_IN_CATALOG }
  const decision = decideRedirect({
    tool: { url: reviewed.url, affiliateUrl: null, allowedHosts: reviewed.allowedHosts },
  })
  if (decision.type === 'not_found') return { status: 404, body: NOT_IN_CATALOG }
  return { status: 302, location: decision.url, click: null }
}

/**
 * At most one database call is awaited before the redirect, and a rate-limit
 * failure or timeout fails open. The click row is returned for the route to
 * write after the response, so a click log cannot block or 503 the redirect.
 */
export async function resolveGoRedirect(input: {
  headers: Headers
  ip: string | null
  siteUrl: string
  seedUrl: string
  allowedHosts: readonly string[]
  deadlineMs?: number
  limit: () => Promise<{ ok: boolean }>
  loadTool: () => Promise<GoToolRecord | null>
}): Promise<GoOutcome> {
  const deadlineMs = input.deadlineMs ?? GO_DB_BUDGET_MS
  const [allowed, loaded] = await Promise.all([
    rateLimitAllows(input.limit, deadlineMs),
    loadReviewedTool(input.loadTool, deadlineMs),
  ])

  if (!allowed) {
    return { status: 429, body: 'Too many clicks from this network. Try again in a minute.' }
  }

  if (loaded.ok && !loaded.tool) {
    return { status: 404, body: 'That tool is not in the catalog.' }
  }

  const record = loaded.ok ? loaded.tool : null
  const decision = decideRedirect({
    tool: {
      url: record?.url ?? input.seedUrl,
      affiliateUrl: record?.affiliateUrl ?? null,
      allowedHosts: input.allowedHosts,
    },
  })
  if (decision.type === 'not_found') {
    return { status: 404, body: 'That tool is not in the catalog.' }
  }

  const purpose = input.headers.get('purpose')
  const prefetch = input.headers.get('next-router-prefetch')
  const click =
    record && purpose !== 'prefetch' && prefetch !== '1'
      ? {
          toolId: record.id,
          page: sameOriginPath(input.headers.get('referer'), input.siteUrl),
          country: countryCode(input.headers),
          ipHash: hashIp(input.ip),
        }
      : null

  return { status: 302, location: decision.url, click }
}

async function rateLimitAllows(limit: () => Promise<{ ok: boolean }>, deadlineMs: number): Promise<boolean> {
  try {
    const result = await withDeadline(limit(), deadlineMs)
    return result.ok
  } catch (error) {
    console.error('go rate limit failed', isDeadline(error) ? 'deadline' : error instanceof Error ? error.name : 'error')
    return true
  }
}

async function loadReviewedTool(
  loadTool: () => Promise<GoToolRecord | null>,
  deadlineMs: number,
): Promise<{ ok: true; tool: GoToolRecord | null } | { ok: false }> {
  try {
    return { ok: true, tool: await withDeadline(loadTool(), deadlineMs) }
  } catch (error) {
    console.error('go catalog failed', isDeadline(error) ? 'deadline' : error instanceof Error ? error.name : 'error')
    return { ok: false }
  }
}
