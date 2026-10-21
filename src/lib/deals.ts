import 'server-only'

import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { currentClerkUserId } from './members'
import { getDb } from './db'
import { deals, subscriptions } from './db/schema'
import { DEALS_MEMBER_PRICE_IDS_ENV, isDealMember, liveDealViews, parseMemberPriceIds, type DealRow, type DealView } from './deals-view'
import { isStripeConfigured } from './stripe'

// One read per 5 minutes for every page; expiry is re-checked on each request.
const cachedActiveDeals = unstable_cache(
  async (): Promise<DealRow[]> => getDb().select().from(deals).where(eq(deals.active, true)),
  ['active-deals-v1'],
  { revalidate: 300, tags: ['deals'] },
)

async function loadDeals(): Promise<DealRow[]> {
  try {
    return await cachedActiveDeals()
  } catch (error) {
    console.error('deals unavailable', error instanceof Error ? error.name : 'error')
    return []
  }
}

/** Fails closed: any error or an unset flag means not a member. */
export async function isCurrentUserDealMember(): Promise<boolean> {
  const memberPriceIds = parseMemberPriceIds(process.env[DEALS_MEMBER_PRICE_IDS_ENV])
  if (memberPriceIds.length === 0 || !isStripeConfigured()) return false
  try {
    const userId = await currentClerkUserId()
    if (!userId) return false
    const rows = await getDb()
      .select({ status: subscriptions.status, stripePriceId: subscriptions.stripePriceId })
      .from(subscriptions)
      .where(eq(subscriptions.clerkUserId, userId))
    return isDealMember({ userId, stripeConfigured: true, memberPriceIds, subscriptions: rows })
  } catch {
    return false
  }
}

/** Views for the page. The membership read happens only when there is a live deal to show. */
export async function loadDealViews(toolSlug?: string): Promise<{ member: boolean; views: DealView[] }> {
  const rows = await loadDeals()
  const now = Date.now()
  if (liveDealViews(rows, false, now, toolSlug).length === 0) return { member: false, views: [] }
  const member = await isCurrentUserDealMember()
  return { member, views: liveDealViews(rows, member, now, toolSlug) }
}
