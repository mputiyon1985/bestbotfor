import { NextResponse } from 'next/server'
import { getCatalog } from '@/lib/catalog'
import { getDb } from '@/lib/db'
import { withDeadline } from '@/lib/deadline'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { brandedOgImage } from '@/lib/og-card'
import {
  canonicalOgPath,
  OG_CACHE_CONTROL,
  OG_DB_BUDGET_MS,
  OG_RATE_LIMIT,
  OG_RATE_WINDOW_MS,
  OG_UNAVAILABLE_CACHE_CONTROL,
  ogCopy,
  type OgCopy,
} from '@/lib/og'
import { gateOgRequest } from '@/lib/og-request'
import { consumeRateLimit } from '@/lib/rate-limit'
import { TAGLINE } from '@/lib/site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK: OgCopy = { title: TAGLINE, subtitle: 'One pick and two alternatives.' }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const [gate, catalog] = await Promise.all([
    gateOgRequest(
      (async () => {
        const db = getDb()
        return consumeRateLimit(db, rateLimitKey(clientIp(request.headers), 'og'), OG_RATE_LIMIT, OG_RATE_WINDOW_MS)
      })(),
    ),
    withDeadline(getCatalog(), OG_DB_BUDGET_MS).catch((error: unknown) => {
      console.error('og catalog failed', error instanceof Error ? error.name : 'error')
      return null
    }),
  ])

  if (gate === 'limit') {
    return new NextResponse('Too many preview requests. Try again in a minute.', {
      status: 429,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  if (!catalog) {
    return brandedOgImage(FALLBACK, OG_UNAVAILABLE_CACHE_CONTROL)
  }

  const canonical = canonicalOgPath(url.searchParams, catalog)
  const current = url.pathname + url.search
  if (canonical && current !== canonical) {
    return new NextResponse(null, {
      status: 308,
      headers: {
        location: canonical,
        'cache-control': OG_CACHE_CONTROL,
      },
    })
  }

  const copy = catalog
    ? ogCopy(
        {
          kind: url.searchParams.get('kind') ?? undefined,
          pair: url.searchParams.get('pair') ?? undefined,
          task: url.searchParams.get('task') ?? undefined,
          budget: url.searchParams.get('budget') ?? undefined,
          skill: url.searchParams.get('skill') ?? undefined,
        },
        catalog,
      )
    : FALLBACK

  return brandedOgImage(copy)
}
