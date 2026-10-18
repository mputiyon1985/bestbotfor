import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { createBeehiivSubscription, isBeehiivConfigured, lookupBeehiivSubscriptionByEmail } from './beehiiv-api'
import type { Database } from './db/client'
import { dbHost, isProdHost, UNPARSEABLE } from './db/guard'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import { newsletterReferringPath } from './newsletter-source'
import {
  PENDING_SUBSCRIBER_STATUS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCING_STALE_AFTER_MS,
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
  | { kind: 'held'; id: number; created: boolean; claimClock: number }
  | { kind: 'done' }
  | { kind: 'busy' }

export type ReconcileResult = {
  dryRun: boolean
  stale: number
  synced: number
  released: number
  failed: number
  unconfigured: boolean
}

type HeldRow = {
  id: number
  email: string
  status: string
  destination: string
  syncingStartedAt: number | null
}

/** A missing clock is stale. A claim newer than the threshold is still in flight. */
export function isSyncingStale(startedAt: number | null, now: number, staleAfterMs = SYNCING_STALE_AFTER_MS): boolean {
  if (startedAt === null) return true
  return now - startedAt >= staleAfterMs
}

/** `--stuck-after-ms` overrides the default. Omitted uses fifteen minutes. */
export function readStuckAfterMs(argv: readonly string[], fallback = SYNCING_STALE_AFTER_MS): number {
  const inline = argv.find((arg) => arg.startsWith('--stuck-after-ms='))
  const index = argv.indexOf('--stuck-after-ms')
  if (!inline && index < 0) return fallback
  const raw = inline ? inline.slice('--stuck-after-ms='.length) : argv[index + 1]
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('--stuck-after-ms must be a positive number of milliseconds.')
  }
  return Number(raw)
}

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

/** Matches the clock read before a lookup, including a null clock left by a crash. */
function sameClaimClock(claimClock: number | null): SQL {
  return claimClock === null ? isNull(subscribers.syncingStartedAt) : eq(subscribers.syncingStartedAt, claimClock)
}

/** One conditional update. A signup and a backfill cannot both win this row. */
export async function claimPendingSubscriber(db: Database, id: number, now: number): Promise<boolean> {
  const claimed = await db
    .update(subscribers)
    .set({ status: SYNCING_SUBSCRIBER_STATUS, syncingStartedAt: now })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, PENDING_SUBSCRIBER_STATUS)))
    .returning({ id: subscribers.id })
  return claimed.length === 1
}

/**
 * Moves a stale syncing row onto a new clock. The WHERE clause is the clock observed
 * before the lookup, so only one signup wins and only that winner may post.
 */
export async function reclaimStaleSubscriber(
  db: Database,
  id: number,
  observedClock: number | null,
  now: number,
): Promise<boolean> {
  const claimed = await db
    .update(subscribers)
    .set({ status: SYNCING_SUBSCRIBER_STATUS, syncingStartedAt: now })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS), sameClaimClock(observedClock)))
    .returning({ id: subscribers.id })
  return claimed.length === 1
}

/** Marks synced only while this caller still owns the claim clock. */
export async function finishSubscriberSync(
  db: Database,
  id: number,
  beehiivId: string | null,
  claimClock: number | null,
): Promise<boolean> {
  const saved = await db
    .update(subscribers)
    .set({
      destination: 'beehiiv',
      beehiivId,
      status: SYNCED_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS), sameClaimClock(claimClock)))
    .returning({ id: subscribers.id })
  return saved.length === 1
}

/**
 * A failed call puts this claim back to pending. A row this call inserted is removed.
 * The clock is the one observed before a lookup, or the clock this call wrote.
 * Zero rows means someone else re-claimed it, so the caller must not post.
 */
export async function releaseSubscriberHold(
  db: Database,
  id: number,
  created: boolean,
  claimClock: number | null,
): Promise<boolean> {
  const owned = and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS), sameClaimClock(claimClock))
  if (created) {
    const removed = await db.delete(subscribers).where(owned).returning({ id: subscribers.id })
    return removed.length === 1
  }
  const released = await db
    .update(subscribers)
    .set({ status: PENDING_SUBSCRIBER_STATUS, syncingStartedAt: null })
    .where(owned)
    .returning({ id: subscribers.id })
  return released.length === 1
}

async function claimOrDone(db: Database, id: number, now: number): Promise<SubscriberHold> {
  const claimed = await claimPendingSubscriber(db, id, now)
  if (claimed) return { kind: 'held', id, created: false, claimClock: now }
  const again = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS && again[0].destination === 'beehiiv') return { kind: 'done' }
  return { kind: 'busy' }
}

async function syncedOrBusy(db: Database, id: number): Promise<SubscriberHold> {
  const again = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS && again[0].destination === 'beehiiv') return { kind: 'done' }
  return { kind: 'busy' }
}

async function holdExisting(
  db: Database,
  row: HeldRow,
  now: number,
  fetchImpl?: typeof fetch,
): Promise<SubscriberHold> {
  if (row.status === SYNCED_SUBSCRIBER_STATUS && row.destination === 'beehiiv') return { kind: 'done' }
  if (row.status === SYNCING_SUBSCRIBER_STATUS) {
    if (!isSyncingStale(row.syncingStartedAt, now)) return { kind: 'busy' }
    const observedClock = row.syncingStartedAt
    const lookup = await lookupBeehiivSubscriptionByEmail({ email: row.email, fetchImpl })
    if (lookup.outcome === 'found') {
      const saved = await finishSubscriberSync(db, row.id, lookup.id, observedClock)
      if (saved) return { kind: 'done' }
      return syncedOrBusy(db, row.id)
    }
    if (lookup.outcome === 'missing') {
      const won = await reclaimStaleSubscriber(db, row.id, observedClock, now)
      if (!won) return syncedOrBusy(db, row.id)
      return { kind: 'held', id: row.id, created: false, claimClock: now }
    }
    return { kind: 'busy' }
  }
  if (row.status !== PENDING_SUBSCRIBER_STATUS) return { kind: 'busy' }
  return claimOrDone(db, row.id, now)
}

/**
 * Marks the row in progress before Beehiiv is called. A concurrent signup or backfill
 * loses the conditional update and must not send the address again.
 */
export async function holdSubscriberForBeehiiv(
  db: Database,
  email: string,
  now: number,
  fetchImpl?: typeof fetch,
): Promise<SubscriberHold> {
  const existing = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1)
  if (existing[0]) return holdExisting(db, existing[0], now, fetchImpl)
  try {
    const inserted = await db
      .insert(subscribers)
      .values({
        email,
        createdAt: now,
        destination: 'local',
        beehiivId: null,
        status: SYNCING_SUBSCRIBER_STATUS,
        syncingStartedAt: now,
      })
      .returning({ id: subscribers.id })
    const id = inserted[0]?.id
    if (id === undefined) return { kind: 'busy' }
    return { kind: 'held', id, created: true, claimClock: now }
  } catch (error) {
    const again = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1)
    if (!again[0]) throw error
    return holdExisting(db, again[0], now, fetchImpl)
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
  now?: number
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
  const now = input.now ?? Date.now()
  for (const row of pendingRows) {
    const claimed = await claimPendingSubscriber(input.db, row.id, now)
    if (!claimed) continue
    const remote = await createBeehiivSubscription({
      email: row.email,
      referringSite: absoluteUrl(newsletterReferringPath('newsletter')),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      await releaseSubscriberHold(input.db, row.id, false, now)
      failed += 1
      continue
    }
    const saved = await finishSubscriberSync(input.db, row.id, remote.id, now)
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

/**
 * Looks up each stale syncing row by email. A found address is marked synced and is not posted.
 * A missing address returns to pending. Dry-run counts them and does not call Beehiiv.
 * Fresh syncing rows stay claimed. Syncing rows are not subscriber counts.
 */
export async function reconcileStuckSubscribers(input: {
  db: Database
  apply: boolean
  now?: number
  staleAfterMs?: number
  fetchImpl?: typeof fetch
}): Promise<ReconcileResult> {
  const now = input.now ?? Date.now()
  const staleAfterMs = input.staleAfterMs ?? SYNCING_STALE_AFTER_MS
  const syncingRows = await input.db.select().from(subscribers).where(eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS))
  const staleRows = syncingRows.filter((row) => isSyncingStale(row.syncingStartedAt, now, staleAfterMs))
  if (!input.apply) {
    return {
      dryRun: true,
      stale: staleRows.length,
      synced: 0,
      released: 0,
      failed: 0,
      unconfigured: !isBeehiivConfigured(),
    }
  }
  if (!isBeehiivConfigured()) {
    return {
      dryRun: false,
      stale: staleRows.length,
      synced: 0,
      released: 0,
      failed: staleRows.length,
      unconfigured: true,
    }
  }
  let synced = 0
  let released = 0
  let failed = 0
  for (const row of staleRows) {
    const observedClock = row.syncingStartedAt
    const lookup = await lookupBeehiivSubscriptionByEmail({ email: row.email, fetchImpl: input.fetchImpl })
    if (lookup.outcome === 'found') {
      const saved = await finishSubscriberSync(input.db, row.id, lookup.id, observedClock)
      if (saved) {
        synced += 1
        continue
      }
      const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
      if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
      else failed += 1
      continue
    }
    if (lookup.outcome === 'missing') {
      const releasedRow = await releaseSubscriberHold(input.db, row.id, false, observedClock)
      if (releasedRow) {
        released += 1
        continue
      }
      const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
      if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
      else if (again[0]?.status === PENDING_SUBSCRIBER_STATUS) released += 1
      else failed += 1
      continue
    }
    failed += 1
  }
  return { dryRun: false, stale: staleRows.length, synced, released, failed, unconfigured: false }
}
