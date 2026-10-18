import { NextResponse } from 'next/server'
import { withDeadline } from '@/lib/deadline'
import { getDb } from '@/lib/db'
import { GO_DB_BUDGET_MS } from '@/lib/go-redirect'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { consumeRateLimit } from '@/lib/rate-limit'
import { approvedSponsorRedirectUrl, scheduleSponsorCardClick } from '@/lib/sponsor-impressions'

const GO_ROBOTS_TAG = 'noindex, nofollow'
const MISSING = 'That sponsored placement is not available.'
const LIMITED = 'Too many clicks from this network. Try again in a minute.'

export const dynamic = 'force-dynamic'

/**
 * Redirect for the Sponsored card only. The destination is the approved card
 * URL stored for this placement. Request query strings are ignored.
 */
export async function GET(request: Request, context: { params: Promise<{ placementId: string }> }) {
  const { placementId: rawId } = await context.params
  const placementId = readPlacementId(rawId)
  if (placementId == null) return text(MISSING, 404)

  const db = getDb()
  if (!(await sponsorGoAllowed(db, clientIp(request.headers)))) return text(LIMITED, 429)

  const destination = await approvedSponsorRedirectUrl(db, placementId, Date.now())
  if (!destination) return text(MISSING, 404)

  scheduleSponsorCardClick({
    db,
    sponsorshipId: placementId,
    now: Date.now(),
    method: request.headers.get('x-bbf-method') ?? request.method,
    userAgent: request.headers.get('user-agent'),
    purpose: request.headers.get('purpose'),
    secPurpose: request.headers.get('sec-purpose'),
    routerPrefetch: request.headers.get('next-router-prefetch') ?? request.headers.get('next-router-segment-prefetch'),
    middlewarePrefetch: request.headers.get('x-middleware-prefetch'),
  })

  const response = NextResponse.redirect(destination, 302)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', GO_ROBOTS_TAG)
  return response
}

function readPlacementId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,17}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

/** Same fail-open budget as a catalog Visit redirect. A full window is a 429. */
async function sponsorGoAllowed(db: ReturnType<typeof getDb>, ip: string | null): Promise<boolean> {
  try {
    const result = await withDeadline(consumeRateLimit(db, rateLimitKey(ip, 'sponsor-go'), 60, 60_000), GO_DB_BUDGET_MS)
    return result.ok
  } catch (error) {
    console.error('sponsor go rate limit failed', error instanceof Error ? error.name : 'error')
    return true
  }
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
