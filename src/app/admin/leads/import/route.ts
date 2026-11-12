import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireLeadsSession } from '@/lib/leads/access'
import { leadsPassword, leadsPasswordMatches } from '@/lib/leads/auth/password'
import { checkLeadsAttempt, leadsAttemptKey, recordLeadsFailure } from '@/lib/leads/auth/rate-limit'
import { parseLeadBody } from '@/lib/leads/parse'
import { upsertLeads } from '@/lib/leads/store'
import { isSameOrigin } from '@/lib/signups/auth/origin'
import { applyPrivacyHeaders } from '@/lib/signups/privacy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status })
  applyPrivacyHeaders(response.headers)
  return response
}

function notFoundResponse(): NextResponse {
  const response = new NextResponse('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  applyPrivacyHeaders(response.headers)
  return response
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer (.+)$/i.exec(header)
  return match?.[1] ? match[1] : null
}

export async function POST(request: Request) {
  const access = await requireLeadsSession(request)
  if (!access.configured) return notFoundResponse()

  const sessionOk = Boolean(access.session) && isSameOrigin(request)
  if (!sessionOk) {
    const token = bearerToken(request)
    const expected = leadsPassword()
    if (!token || !expected) return json({ error: 'unauthorized' }, 401)

    const bucket = leadsAttemptKey(request)
    if (bucket.action === 'refuse') return json({ error: 'unauthorized' }, 401)
    let db
    try {
      db = getDb()
    } catch {
      return json({ error: 'unavailable' }, 503)
    }
    const gate = await checkLeadsAttempt(db, bucket.key)
    if (gate === 'unavailable') return json({ error: 'unavailable' }, 503)
    if (gate === 'limited') return json({ error: 'limited' }, 429)
    if (!leadsPasswordMatches(token, expected)) {
      try {
        await recordLeadsFailure(db, bucket.key)
      } catch {
        return json({ error: 'unavailable' }, 503)
      }
      return json({ error: 'unauthorized' }, 401)
    }
  }

  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > 1_000_000) return json({ errors: ['File is too large.'] }, 413)

  let text: string
  try {
    text = await request.text()
  } catch {
    return json({ errors: ['The body could not be read.'] }, 400)
  }
  const parsed = parseLeadBody(request.headers.get('content-type') ?? '', text)
  if (!parsed.ok) return json({ errors: parsed.errors }, 400)

  try {
    const upserted = await upsertLeads(getDb(), parsed.rows)
    return json({ upserted }, 200)
  } catch {
    return json({ error: 'unavailable' }, 503)
  }
}
