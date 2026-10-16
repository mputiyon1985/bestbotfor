import { NextResponse } from 'next/server'
import { CATALOG_REJECT_MESSAGE } from '@/lib/catalog-path'

export const dynamic = 'force-dynamic'

/** Plain-text 404 for catalog paths that would otherwise collapse to `/`. */
export function GET() {
  return new NextResponse(CATALOG_REJECT_MESSAGE, {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
