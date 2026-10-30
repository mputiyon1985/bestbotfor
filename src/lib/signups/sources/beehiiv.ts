import 'server-only'
import { normalizeEmail, toIso } from '../format'
import { getJson } from './http'
import { MAX_SIGNUPS, unavailable, type Signup, type SourceResult } from '../types'

const PAGE_SIZE = 100
const MAX_PAGES = 50

function logFailure(): void {
  console.error('source unavailable: beehiiv')
}

export async function fetchBeehiivSignups(): Promise<SourceResult> {
  const apiKey = process.env.BEEHIIV_API_KEY?.trim() ?? ''
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID?.trim() ?? ''
  if (!apiKey || !publicationId) return unavailable('beehiiv')

  try {
    const signups: Signup[] = []
    let total: number | null = null
    let page = 1

    while (signups.length < MAX_SIGNUPS && page <= MAX_PAGES) {
      const url = new URL(`https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`)
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('page', String(page))
      const body = (await getJson(url.toString(), apiKey)) as {
        data?: unknown
        total_results?: unknown
        total_pages?: unknown
      }
      if (typeof body.total_results === 'number') total = body.total_results
      const data = Array.isArray(body.data) ? body.data : []
      for (const item of data) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const email = normalizeEmail(record.email)
        const createdAt = toIso(record.created ?? record.created_at)
        if (!email || !createdAt) continue
        signups.push({ source: 'beehiiv', email, createdAt })
        if (signups.length >= MAX_SIGNUPS) break
      }
      const totalPages = typeof body.total_pages === 'number' ? body.total_pages : null
      if (data.length < PAGE_SIZE) break
      if (totalPages !== null && page >= totalPages) break
      page += 1
    }

    return {
      source: 'beehiiv',
      ok: true,
      signups,
      total: total ?? signups.length,
      capped: signups.length >= MAX_SIGNUPS && (total ?? signups.length) > signups.length,
    }
  } catch {
    logFailure()
    return unavailable('beehiiv')
  }
}
