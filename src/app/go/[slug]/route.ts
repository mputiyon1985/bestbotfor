import { NextResponse } from 'next/server'
import { getCatalog } from '@/lib/catalog'
import { getDb } from '@/lib/db'
import { clicks } from '@/lib/db/schema'
import { clientIp, countryCode, hashIp, rateLimitKey, sameOriginPath } from '@/lib/ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { decideRedirect } from '@/lib/redirect'
import { getSiteUrl } from '@/lib/site'
import { slugSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * Allowlist redirect. The destination is the tool's official URL from the
 * database. Query strings, affiliate_url, and anything else the caller sends
 * are ignored. A stored URL that is not public https is refused.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  if (!slugSchema.safeParse(slug).success) {
    return text('That address is not a tool in the catalog.', 404)
  }

  const db = getDb()
  const ip = clientIp(request.headers)
  let limited: { ok: boolean }
  try {
    limited = await consumeRateLimit(db, rateLimitKey(ip, 'go'), 60, 60_000)
  } catch (error) {
    console.error('go rate limit failed', error instanceof Error ? error.name : 'error')
    return text('Try again in a minute.', 503)
  }
  if (!limited.ok) return text('Too many clicks from this network. Try again in a minute.', 429)

  const catalog = await getCatalog()
  const tool = catalog.tools.find((item) => item.slug === slug) ?? null
  const decision = decideRedirect({
    tool: tool ? { url: tool.url, affiliateUrl: tool.affiliate.affiliateUrl } : null,
  })
  if (decision.type === 'not_found' || !tool) {
    return text('That tool is not in the catalog.', 404)
  }

  const purpose = request.headers.get('purpose')
  const prefetch = request.headers.get('next-router-prefetch')
  if (purpose !== 'prefetch' && prefetch !== '1') {
    try {
      await db.insert(clicks).values({
        toolId: tool.id,
        page: sameOriginPath(request.headers.get('referer'), getSiteUrl()),
        ts: Date.now(),
        country: countryCode(request.headers),
        ipHash: hashIp(ip),
      })
    } catch (error) {
      console.error('click log failed', error instanceof Error ? error.name : 'error')
    }
  }

  const response = NextResponse.redirect(decision.url, 302)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function text(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
