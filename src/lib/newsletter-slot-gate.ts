import 'server-only'

import { unstable_cache } from 'next/cache'
import { getDb } from './db'
import { countSyncedSubscribers } from './newsletter'

/** The $49 newsletter slot is sold only once the list has at least one synced subscriber. */
export function newsletterSlotOpen(syncedSubscribers: number): boolean {
  return Number.isFinite(syncedSubscribers) && syncedSubscribers > 0
}

// One read per hour: the sponsor page is dynamic, and the count changes slowly.
const cachedSyncedCount = unstable_cache(async () => countSyncedSubscribers(getDb()), ['newsletter-synced-count-v1'], {
  revalidate: 3600,
})

/** Fails closed: a read error hides the slot rather than selling it to an empty list. */
export async function newsletterSlotAvailable(read: () => Promise<number> = cachedSyncedCount): Promise<boolean> {
  try {
    return newsletterSlotOpen(await read())
  } catch {
    return false
  }
}
