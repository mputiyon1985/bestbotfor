import { randomUUID } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { toolSeeds } from '@/data/catalog'
import { getTool } from '@/lib/catalog'
import { withDeadline } from '@/lib/deadline'
import { getDb } from '@/lib/db'
import { clicks } from '@/lib/db/schema'
import { withAffiliateSubId } from '@/lib/affiliate-subid'
import { GO_DB_BUDGET_MS, resolveGoRedirect, resolveHeadGoRedirect, type GoClick } from '@/lib/go-redirect'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { consumeRateLimit } from '@/lib/rate-limit'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import { getSiteUrl } from '@/lib/site'
import { slugSchema } from '@/lib/validation'

const GO_ROBOTS_TAG = 'noindex, nofollow'

export const dynamic = 'force-dynamic'

/**
 * Allowlist redirect. The destination is the tool's official URL unless that
 * program's status is exactly "active" and affiliate_programs.affiliate_url
 * passes the same host allowlist. Only utm_* query keys are passed on. An
 * active PartnerStack, Impact, or Dub click gets a random SubID, not the
 * sequential click row id. The click row is written after the response.
 *
 * HEAD is the cheap path. Next would otherwise run this GET handler, which
 * logs a rate-limit or catalog deadline while still answering 302.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (request.method === 'HEAD') return headRedirect(context)
  const { slug } = await context.params
  if (isUnsafeCatalogSlug(slug) || !slugSchema.safeParse(slug).success) {
    return text('That address is not a tool in the catalog.', 404)
  }

  const reviewed = toolSeeds.find((item) => item.slug === slug && !item.unlisted)
  if (!reviewed) return text('That tool is not in the catalog.', 404)

  const db = getDb()
  const ip = clientIp(request.headers)
  const outcome = await resolveGoRedirect({
    headers: request.headers,
    ip,
    siteUrl: getSiteUrl(),
    search: new URL(request.url).search,
    seedUrl: reviewed.url,
    seedAffiliateUrl: reviewed.affiliate.affiliateUrl ?? null,
    seedAffiliateStatus: reviewed.affiliate.status,
    seedNetwork: reviewed.affiliate.network,
    allowedHosts: reviewed.allowedHosts,
    limit: () => consumeRateLimit(db, rateLimitKey(ip, 'go'), ACTION_LIMITS.go.limit, ACTION_LIMITS.go.windowMs),
    loadTool: async () => {
      const tool = await getTool(slug)
      if (!tool) return null
      return {
        id: tool.id,
        url: tool.url,
        affiliateUrl: tool.affiliate.affiliateUrl,
        affiliateStatus: tool.affiliate.status,
        network: tool.affiliate.network,
      }
    },
  })

  if (outcome.status !== 302) return text(outcome.body, outcome.status)

  let location = outcome.location
  const click = outcome.click
  const publicId = click?.affiliate && click.subIdParam ? randomUUID() : null
  if (click?.subIdParam && publicId) {
    location = withAffiliateSubId(location, click.subIdParam, `${click.page}.${publicId}`)
  }
  if (click) {
    const row = clickRow(click, publicId)
    after(async () => {
      try {
        await withDeadline(db.insert(clicks).values(row), GO_DB_BUDGET_MS)
      } catch (error) {
        console.error('click log failed', error instanceof Error ? error.name : 'error')
      }
    })
  }

  return redirect(location)
}

function clickRow(click: GoClick, publicId: string | null) {
  return {
    toolId: click.toolId,
    page: click.page,
    ts: Date.now(),
    country: click.country,
    ipHash: click.ipHash,
    affiliate: click.affiliate,
    programId: click.programId,
    publicId,
  }
}

/** Same 302 as GET, with no rate limit, catalog read, or click write. */
export function HEAD(_request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  return headRedirect(context)
}

async function headRedirect(context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params
  const outcome = resolveHeadGoRedirect(slug)
  if (outcome.status !== 302) return text(outcome.body, outcome.status)
  return redirect(outcome.location)
}

function redirect(location: string) {
  const response = NextResponse.redirect(location, 302)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', GO_ROBOTS_TAG)
  return response
}

function text(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': GO_ROBOTS_TAG,
    },
  })
}
