import { and, eq } from 'drizzle-orm'
import { createBeehiivSubscription, isBeehiivConfigured } from './beehiiv-api'
import type { Database } from './db/client'
import { dbHost, isProdHost, UNPARSEABLE } from './db/guard'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import { newsletterReferringPath } from './newsletter-source'
import {
  PENDING_SUBSCRIBER_STATUS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCING_SUBSCRIBER_STATUS,
} from './newsletter-status'

export type BackfillResult = {
  dryRun: boolean
  pending: number
  syncing: number
  synced: number
  failed: number
  unconfigured: boolean
}

export type SubscriberHold =
  | { kind: 'held'; id: number; created: boolean }
  | { kind: 'done' }
  | { kind: 'busy' }

/**
 * Turso's database name is the first label of the host. A local file uses its file name.
 * `BACKFILL_PROD_CONFIRM` has to equal this before a production launch.
 */
export function newsletterDatabaseName(url: string): string | null {
  const trimmed = url.trim()
  const host = dbHost(trimmed)
  if (host && host !== UNPARSEABLE) {
    const label = host.split('.')[0] ?? ''
    return label || null
  }
  if (trimmed === ':memory:' || host === UNPARSEABLE) return null
  if (!trimmed.startsWith('file:')) return null
  const pathPart = trimmed.slice('file:'.length).replace(/^\/\//, '')
  const base = pathPart.split(/[/\\]/).filter(Boolean).pop() ?? ''
  return base || null
}

/**
 * Dry-run is the caller's default. Production and the production database are refused
 * unless `productionLaunch` is set and `confirmName` equals `newsletterDatabaseName`.
 */
export function newsletterBackfillAllowed(input: {
  vercelEnv: string | undefined
  databaseUrl: string | undefined
  productionLaunch?: boolean
  confirmName?: string
}): { ok: true } | { ok: false; reason: string } {
  const url = input.databaseUrl?.trim() ?? ''
  if (!url) return { ok: false, reason: 'Set TURSO_DATABASE_URL before the newsletter backfill.' }
  if (input.productionLaunch) {
    const name = newsletterDatabaseName(url)
    const confirm = input.confirmName?.trim() ?? ''
    if (!name || confirm !== name) {
      return {
        ok: false,
        reason: name
          ? `BACKFILL_PROD_CONFIRM must equal the database name "${name}" before a production launch.`
          : 'BACKFILL_PROD_CONFIRM must equal the database name before a production launch.',
      }
    }
    return { ok: true }
  }
  if ((input.vercelEnv ?? '').trim() === 'production') {
    return { ok: false, reason: 'Newsletter backfill does not run in production.' }
  }
  const host = dbHost(url)
  if (host && isProdHost(host)) {
    return { ok: false, reason: 'Newsletter backfill does not run against the production database.' }
  }
  return { ok: true }
}

/** One conditional update. A signup and a backfill cannot both win this row. */
export async function claimPendingSubscriber(db: Database, id: number): Promise<boolean> {
  const claimed = await db
    .update(subscribers)
    .set({ status: SYNCING_SUBSCRIBER_STATUS })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, PENDING_SUBSCRIBER_STATUS)))
    .returning({ id: subscribers.id })
  return claimed.length === 1
}

export async function finishSubscriberSync(db: Database, id: number, beehiivId: string | null): Promise<boolean> {
  const saved = await db
    .update(subscribers)
    .set({ destination: 'beehiiv', beehiivId, status: SYNCED_SUBSCRIBER_STATUS })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS)))
    .returning({ id: subscribers.id })
  return saved.length === 1
}

/** A failed call puts a claimed row back to pending. A row this call inserted is removed. */
export async function releaseSubscriberHold(db: Database, id: number, created: boolean): Promise<void> {
  if (created) {
    await db
      .delete(subscribers)
      .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS)))
    return
  }
  await db
    .update(subscribers)
    .set({ status: PENDING_SUBSCRIBER_STATUS })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS)))
}

async function holdExisting(db: Database, row: { id: number; status: string; destination: string }): Promise<SubscriberHold> {
  if (row.status === SYNCED_SUBSCRIBER_STATUS && row.destination === 'beehiiv') return { kind: 'done' }
  if (row.status !== PENDING_SUBSCRIBER_STATUS) return { kind: 'busy' }
  const claimed = await claimPendingSubscriber(db, row.id)
  if (claimed) return { kind: 'held', id: row.id, created: false }
  const again = await db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
  if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS && again[0].destination === 'beehiiv') return { kind: 'done' }
  return { kind: 'busy' }
}

/**
 * Marks the row in progress before Beehiiv is called. A concurrent signup or backfill
 * loses the conditional update and must not send the address again.
 */
export async function holdSubscriberForBeehiiv(db: Database, email: string, now: number): Promise<SubscriberHold> {
  const existing = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1)
  if (existing[0]) return holdExisting(db, existing[0])
  try {
    const inserted = await db
      .insert(subscribers)
      .values({
        email,
        createdAt: now,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
      })
      .returning({ id: subscribers.id })
    const id = inserted[0]?.id
    if (id === undefined) return { kind: 'busy' }
    return { kind: 'held', id, created: true }
  } catch (error) {
    const again = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1)
    if (!again[0]) throw error
    return holdExisting(db, again[0])
  }
}

/**
 * Sends each pending address to Beehiiv with double opt-in. The row is marked syncing
 * before the call. A second run skips rows already synced or still in progress.
 * Dry-run counts them and does not call Beehiiv.
 */
export async function backfillPendingSubscribers(input: {
  db: Database
  apply: boolean
  fetchImpl?: typeof fetch
}): Promise<BackfillResult> {
  const pendingRows = await input.db.select().from(subscribers).where(eq(subscribers.status, PENDING_SUBSCRIBER_STATUS))
  const syncingRows = await input.db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS))
  if (!input.apply) {
    return {
      dryRun: true,
      pending: pendingRows.length,
      syncing: syncingRows.length,
      synced: 0,
      failed: 0,
      unconfigured: !isBeehiivConfigured(),
    }
  }
  if (!isBeehiivConfigured()) {
    return {
      dryRun: false,
      pending: pendingRows.length,
      syncing: syncingRows.length,
      synced: 0,
      failed: pendingRows.length,
      unconfigured: true,
    }
  }
  let synced = 0
  let failed = 0
  for (const row of pendingRows) {
    const claimed = await claimPendingSubscriber(input.db, row.id)
    if (!claimed) continue
    const remote = await createBeehiivSubscription({
      email: row.email,
      referringSite: absoluteUrl(newsletterReferringPath('newsletter')),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      await releaseSubscriberHold(input.db, row.id, false)
      failed += 1
      continue
    }
    const saved = await finishSubscriberSync(input.db, row.id, remote.id)
    if (saved) {
      synced += 1
      continue
    }
    const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
    if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
    else failed += 1
  }
  return {
    dryRun: false,
    pending: pendingRows.length,
    syncing: syncingRows.length,
    synced,
    failed,
    unconfigured: false,
  }
}
