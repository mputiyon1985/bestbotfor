import { after, NextResponse } from 'next/server'
import { toolSeeds } from '@/data/catalog'
import { getTool } from '@/lib/catalog'
import { withDeadline } from '@/lib/deadline'
import { getDb } from '@/lib/db'
import { clicks } from '@/lib/db/schema'
import { GO_DB_BUDGET_MS, resolveGoRedirect, resolveHeadGoRedirect } from '@/lib/go-redirect'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { consumeRateLimit } from '@/lib/rate-limit'
import { isUnsafeCatalogSlug } from '@/lib/catalog-path'
import { getSiteUrl } from '@/lib/site'
import { slugSchema } from '@/lib/validation'

const GO_ROBOTS_TAG = 'noindex, nofollow'

export const dynamic = 'force-dynamic'

/**
 * Allowlist redirect. The destination is the tool's official URL, and the
 * host must be on the reviewed list shipped with the seed. Query strings and
 * affiliate URLs are ignored. The click row is written after the response.
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

  const reviewed = toolSeeds.find((item) => item.slug === slug)
  if (!reviewed) return text('That tool is not in the catalog.', 404)

  const db = getDb()
  const ip = clientIp(request.headers)
  const outcome = await resolveGoRedirect({
    headers: request.headers,
    ip,
    siteUrl: getSiteUrl(),
    seedUrl: reviewed.url,
    allowedHosts: reviewed.allowedHosts,
    limit: () => consumeRateLimit(db, rateLimitKey(ip, 'go'), ACTION_LIMITS.go.limit, ACTION_LIMITS.go.windowMs),
    loadTool: async () => {
      const tool = await getTool(slug)
      if (!tool) return null
      return { id: tool.id, url: tool.url, affiliateUrl: tool.affiliate.affiliateUrl }
    },
  })

  if (outcome.status !== 302) return text(outcome.body, outcome.status)

  const click = outcome.click
  if (click) {
    after(async () => {
      try {
        await withDeadline(
          db.insert(clicks).values({
            toolId: click.toolId,
            page: click.page,
            ts: Date.now(),
            country: click.country,
            ipHash: click.ipHash,
          }),
          GO_DB_BUDGET_MS,
        )
      } catch (error) {
        console.error('click log failed', error instanceof Error ? error.name : 'error')
      }
    })
  }

  return redirect(outcome.location)
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
