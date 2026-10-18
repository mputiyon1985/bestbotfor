const PUBLICATION_ID = /^pub_[0-9a-fA-F-]+$/

export function isBeehiivConfigured(): boolean {
  const key = process.env.BEEHIIV_API_KEY?.trim() ?? ''
  const id = process.env.BEEHIIV_PUBLICATION_ID?.trim() ?? ''
  return key.length > 0 && PUBLICATION_ID.test(id)
}

export type BeehiivResult = { ok: true; id: string | null } | { ok: false }

/**
 * The API key stays on the server. This file has no `server-only` import so
 * `scripts/backfill-beehiiv-subscribers.ts` can load it under plain tsx.
 * App code imports `./beehiiv`, which re-exports this module behind that guard.
 * Double opt-in is always on, so Beehiiv sends the confirmation email.
 * An existing subscriber (HTTP 409) is treated as success.
 */
export async function createBeehiivSubscription(input: {
  email: string
  referringSite: string
  fetchImpl?: typeof fetch
}): Promise<BeehiivResult> {
  const apiKey = process.env.BEEHIIV_API_KEY?.trim() ?? ''
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID?.trim() ?? ''
  if (!apiKey || !PUBLICATION_ID.test(publicationId)) return { ok: false }

  const doFetch = input.fetchImpl ?? fetch
  let result: Response
  try {
    result = await doFetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          reactivate_existing: false,
          send_welcome_email: true,
          double_opt_override: 'on',
          utm_source: 'bestbotfor',
          utm_medium: 'website',
          referring_site: input.referringSite,
        }),
        signal: AbortSignal.timeout(8000),
      },
    )
  } catch (error) {
    console.error('beehiiv request failed', error instanceof Error ? error.name : 'error')
    return { ok: false }
  }

  if (result.status === 409) return { ok: true, id: null }
  if (!result.ok) {
    console.error('beehiiv subscription rejected', result.status)
    return { ok: false }
  }

  try {
    const body = (await result.json()) as { data?: { id?: string } }
    return { ok: true, id: body.data?.id ?? null }
  } catch {
    return { ok: true, id: null }
  }
}

export type BeehiivLookup =
  | { outcome: 'found'; id: string | null; status: string }
  | { outcome: 'missing' }
  | { outcome: 'error' }

/**
 * Reads a subscription by email. A 404 means Beehiiv does not have the address.
 * This does not create a subscription and does not send a confirmation email.
 * The address is not logged.
 */
export async function lookupBeehiivSubscriptionByEmail(input: {
  email: string
  fetchImpl?: typeof fetch
}): Promise<BeehiivLookup> {
  const apiKey = process.env.BEEHIIV_API_KEY?.trim() ?? ''
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID?.trim() ?? ''
  if (!apiKey || !PUBLICATION_ID.test(publicationId)) return { outcome: 'error' }

  const doFetch = input.fetchImpl ?? fetch
  let result: Response
  try {
    result = await doFetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions/by_email/${encodeURIComponent(input.email)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      },
    )
  } catch (error) {
    console.error('beehiiv lookup failed', error instanceof Error ? error.name : 'error')
    return { outcome: 'error' }
  }

  if (result.status === 404) return { outcome: 'missing' }
  if (!result.ok) {
    console.error('beehiiv lookup rejected', result.status)
    return { outcome: 'error' }
  }

  try {
    const body = (await result.json()) as { data?: { id?: string; status?: unknown } }
    const status = typeof body.data?.status === 'string' ? body.data.status : ''
    return { outcome: 'found', id: body.data?.id ?? null, status }
  } catch {
    return { outcome: 'found', id: null, status: '' }
  }
}
