/**
 * SubID query keys the network documents for click reconciliation.
 * PartnerStack: `sid`. Impact: `subId1`. Dub forwards `externalId` on dub.sh.
 * Other networks are left untouched so we do not invent a parameter.
 */
const SUB_ID_PARAMS: Readonly<Record<string, string>> = {
  partnerstack: 'sid',
  impact: 'subId1',
  dub: 'externalId',
}

const SUB_ID_VALUE = /^[a-z0-9./_-]{1,200}$/i

export function affiliateSubIdParam(network: string | null | undefined): string | null {
  if (!network) return null
  return SUB_ID_PARAMS[network.trim().toLowerCase()] ?? null
}

/**
 * Append `page.clickId` on a destination that already passed the host allowlist.
 * An existing value for that key is kept. A value that is not a page path plus
 * an id is skipped so the helper cannot be used to inject a new host or query.
 */
export function withAffiliateSubId(destination: string, param: string, subId: string): string {
  if (!param || !SUB_ID_VALUE.test(subId)) return destination
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return destination
  }
  if (url.searchParams.has(param)) return destination
  url.searchParams.set(param, subId)
  return url.toString()
}
