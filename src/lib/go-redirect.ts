import { toolSeeds } from '@/data/catalog'
import { isUnsafeCatalogSlug } from './catalog-path'
import { isDeadline, withDeadline } from './deadline'
import { countryCode, hashIp, sameOriginPath } from './ip'
import { affiliateRedirectUrl, decideRedirect } from './redirect'
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
 * URL a catalog timeout uses. Affiliate URLs (stored in the DB) and request
 * query strings are not read, so HEAD always answers with the official URL.
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
  /** Incoming query string; only utm_* keys are carried to the destination. */
  search?: string
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

  return { status: 302, location: withUtmParams(decision.url, input.search ?? ''), click }
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

/**
 * True only when /go/[slug] will actually send this click to the affiliate URL:
 * it is set and its host is on the tool's reviewed list. Pages use this for the
 * "Affiliate link" note and rel="sponsored", so the label matches the redirect.
 */
export function servesAffiliateLink(slug: string, affiliateUrl: string | null | undefined): boolean {
  const reviewed = toolSeeds.find((item) => item.slug === slug)
  if (!reviewed) return false
  return affiliateRedirectUrl(affiliateUrl, reviewed.allowedHosts) !== null
}

const UTM_KEY = /^utm_[a-z]{1,20}$/
const MAX_UTM_PARAMS = 5
const MAX_UTM_VALUE = 100

/**
 * Copy utm_* params from the /go request onto the already-allowlisted
 * destination. Other keys are dropped, and the destination's host, path and
 * existing params (an affiliate ref, for example) are never replaced.
 */
export function withUtmParams(destination: string, search: string): string {
  if (!search) return destination
  const url = new URL(destination)
  let added = 0
  for (const [key, value] of new URLSearchParams(search)) {
    if (added >= MAX_UTM_PARAMS) break
    if (!UTM_KEY.test(key) || !value || value.length > MAX_UTM_VALUE) continue
    if (url.searchParams.has(key)) continue
    url.searchParams.set(key, value)
    added += 1
  }
  return url.toString()
}
