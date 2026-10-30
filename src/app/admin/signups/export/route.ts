import { NextResponse } from 'next/server'
import { requireSignupsSession } from '@/lib/signups/access'
import { toCsv } from '@/lib/signups/csv'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'
import { combineSignups, loadAllSources } from '@/lib/signups/sources/load'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

export async function GET(request: Request) {
  const access = await requireSignupsSession(request)
  if (!access.configured) return notFoundResponse()
  if (!access.session) {
    const response = new NextResponse('Unauthorized', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    applyPrivacyHeaders(response.headers)
    return response
  }

  const rows = combineSignups(await loadAllSources())
  const headers = new Headers({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="signups.csv"',
  })
  applyPrivacyHeaders(headers)
  return new NextResponse(toCsv(rows), { status: 200, headers })
}
