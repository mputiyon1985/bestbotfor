import 'server-only'
import { normalizeEmail, toIso } from '../format'
import { getJson } from './http'
import { MAX_SIGNUPS, unavailable, type Signup, type SourceResult } from '../types'

const PAGE_SIZE = 100

function logFailure(): void {
  console.error('source unavailable: clerk')
}

function usersFromBody(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: unknown[] }).data
  }
  return []
}

function primaryEmail(user: Record<string, unknown>): string | null {
  const addresses = Array.isArray(user.email_addresses) ? user.email_addresses : []
  const primaryId = user.primary_email_address_id
  for (const address of addresses) {
    if (!address || typeof address !== 'object') continue
    const record = address as Record<string, unknown>
    if (record.id === primaryId) return normalizeEmail(record.email_address)
  }
  const first = addresses[0]
  if (!first || typeof first !== 'object') return null
  return normalizeEmail((first as Record<string, unknown>).email_address)
}

async function fetchClerkPage(secret: string, offset: number): Promise<unknown[]> {
  const url = new URL('https://api.clerk.com/v1/users')
  url.searchParams.set('limit', String(PAGE_SIZE))
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('order_by', '-created_at')
  return usersFromBody(await getJson(url.toString(), secret))
}

/** Read-only Clerk user list. No session is created and no user is written. */
export async function fetchClerkSignups(): Promise<SourceResult> {
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? ''
  if (!secret) return unavailable('clerk')

  try {
    const countPromise = getJson('https://api.clerk.com/v1/users/count', secret)
      .then((body) => {
        const total = (body as { total_count?: unknown }).total_count
        return typeof total === 'number' ? total : null
      })
      .catch(() => null)

    const signups: Signup[] = []
    let offset = 0
    let reported: number | null = null
    let countJoined = false

    while (signups.length < MAX_SIGNUPS) {
      const pagePromise = fetchClerkPage(secret, offset)
      const page = countJoined ? await pagePromise : (await Promise.all([pagePromise, countPromise]))[0]
      if (!countJoined) {
        reported = await countPromise
        countJoined = true
      }
      if (page.length === 0) break
      for (const user of page) {
        if (!user || typeof user !== 'object') continue
        const record = user as Record<string, unknown>
        const email = primaryEmail(record)
        const createdAt = toIso(record.created_at)
        if (!email || !createdAt) continue
        signups.push({ source: 'clerk', email, createdAt })
        if (signups.length >= MAX_SIGNUPS) break
      }
      offset += page.length
      if (page.length < PAGE_SIZE) break
      if (reported !== null && offset >= reported) break
    }

    return {
      source: 'clerk',
      ok: true,
      signups,
      total: reported ?? signups.length,
      capped: reported !== null && reported > signups.length && signups.length >= MAX_SIGNUPS,
    }
  } catch {
    logFailure()
    return unavailable('clerk')
  }
}
