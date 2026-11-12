import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { readUnsubscribe, recordUnsubscribe } from '@/lib/checkout-recovery-unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
}

function tokenFrom(request: Request): string {
  return new URL(request.url).searchParams.get('token') ?? ''
}

/** Shows the confirmation form. Does not record an opt-out. */
export function GET(request: Request) {
  const page = readUnsubscribe(process.env, tokenFrom(request))
  return new NextResponse(page.html, { status: page.status, headers })
}

/** Records the opt-out. One-click clients and the confirmation form both POST. No login. */
export async function POST(request: Request) {
  const body = await request.text()
  const page = await recordUnsubscribe(getDb(), process.env, tokenFrom(request), body, Date.now())
  return new NextResponse(page.html, { status: page.status, headers })
}
