import { and, count, eq, isNull, lte, or, type SQL } from 'drizzle-orm'
import guardConfig from '../../config/db-guard.json'
import { createBeehiivSubscription, isBeehiivConfigured, lookupBeehiivSubscriptionByEmail } from './beehiiv-api'
import type { Database } from './db/client'
import { dbHost, isProdHost, normalizeHost, UNPARSEABLE, type DbGuardConfig } from './db/guard'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import { newsletterReferringPath } from './newsletter-source'
import {
  FAILED_SUBSCRIBER_STATUS,
  PENDING_SUBSCRIBER_STATUS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCING_STALE_AFTER_MS,
  SYNCING_SUBSCRIBER_STATUS,
  UNSUBSCRIBED_SUBSCRIBER_STATUS,
} from './newsletter-status'

const dbGuard = guardConfig as DbGuardConfig

/** A stuck-row override below one minute would treat an in-flight claim as stale. */
export const MIN_STUCK_AFTER_MS = 60_000

export type BackfillResult = {
  dryRun: boolean
  pending: number
  syncing: number
  synced: number
  failed: number
  unconfigured: boolean
}

export type SubscriberHold =
  | { kind: 'held'; id: number; created: boolean; claimClock: number; restore: 'pending' | 'unsubscribed' }
  | { kind: 'done' }
  | { kind: 'busy' }
  | { kind: 'opted_out' }
  | { kind: 'terminal'; beehiivStatus: string }
  | { kind: 'unavailable' }

export type ReconcileResult = {
  dryRun: boolean
  stale: number
  synced: number
  released: number
  optedOut: number
  terminal: number
  failed: number
  unconfigured: boolean
}

type HeldRow = {
  id: number
  email: string
  status: string
  destination: string
  syncingStartedAt: number | null
  beehiivStatus: string | null
}

/** Callers cannot shrink the in-flight window below one minute. */
export function stuckAfterFloor(value: number): number {
  if (!Number.isFinite(value) || value < MIN_STUCK_AFTER_MS) return MIN_STUCK_AFTER_MS
  return value
}

/** A missing clock is stale. A claim newer than the threshold is still in flight. */
export function isSyncingStale(startedAt: number | null, now: number, staleAfterMs = SYNCING_STALE_AFTER_MS): boolean {
  if (startedAt === null) return true
  return now - startedAt >= stuckAfterFloor(staleAfterMs)
}

/** `--stuck-after-ms` overrides the default. Omitted uses fifteen minutes. Values under one minute are refused. */
export function readStuckAfterMs(argv: readonly string[], fallback = SYNCING_STALE_AFTER_MS): number {
  const inline = argv.find((arg) => arg.startsWith('--stuck-after-ms='))
  const index = argv.indexOf('--stuck-after-ms')
  if (!inline && index < 0) return fallback
  const raw = inline ? inline.slice('--stuck-after-ms='.length) : argv[index + 1]
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new Error('--stuck-after-ms must be a positive number of milliseconds.')
  }
  const value = Number(raw)
  if (value < MIN_STUCK_AFTER_MS) {
    throw new Error(`--stuck-after-ms must be at least ${MIN_STUCK_AFTER_MS} milliseconds.`)
  }
  return value
}

/**
 * `pending` is Beehiiv's double opt-in wait. `validating` means the address is being checked.
 * Both are already in Beehiiv. Every other found status, including an empty one, is terminal.
 */
export function beehiivFoundAction(status: string): 'sync' | 'opt_out' | 'terminal' {
  const value = status.trim().toLowerCase()
  if (value === 'active' || value === 'validating' || value === 'pending') return 'sync'
  if (value === 'inactive' || value === 'unsubscribed') return 'opt_out'
  return 'terminal'
}

/**
 * Dry-run is the caller's default. A production launch requires the parsed host to be
 * exactly a `prodHosts` entry and `confirmName` to equal a `prodDbNames` entry.
 * The confirm value is not taken from the URL and is not included in a refusal.
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
    const host = dbHost(url)
    const prodHosts = dbGuard.prodHosts.map((entry) => normalizeHost(entry))
    if (!host || host === UNPARSEABLE || !prodHosts.includes(host)) {
      return {
        ok: false,
        reason:
          host && host !== UNPARSEABLE
            ? `Newsletter backfill production launch refuses host ${host}.`
            : 'Newsletter backfill production launch refuses this database URL.',
      }
    }
    const confirm = input.confirmName?.trim() ?? ''
    const confirmValues = dbGuard.prodDbNames.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    if (!confirm || !confirmValues.includes(confirm)) {
      return { ok: false, reason: 'BACKFILL_PROD_CONFIRM does not match the configured confirm value.' }
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
  if (observedClock !== null && now <= observedClock) return false
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

/** Records an opt-out only while this caller still owns the claim clock. Does not mark the row synced. */
async function noteSubscriberUnsubscribed(
  db: Database,
  id: number,
  beehiivId: string | null,
  claimClock: number | null,
): Promise<boolean> {
  const saved = await db
    .update(subscribers)
    .set({
      beehiivId,
      status: UNSUBSCRIBED_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    .where(and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS), sameClaimClock(claimClock)))
    .returning({ id: subscribers.id })
  return saved.length === 1
}

/** Parks invalid, paused, or needs_attention. The Beehiiv status is stored. Nothing posts the row. */
async function noteSubscriberTerminal(
  db: Database,
  id: number,
  beehiivId: string | null,
  beehiivStatus: string,
  claimClock: number | null,
): Promise<boolean> {
  const saved = await db
    .update(subscribers)
    .set({
      beehiivId,
      beehiivStatus: beehiivStatus.trim().toLowerCase(),
      status: FAILED_SUBSCRIBER_STATUS,
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
  restore: 'pending' | 'unsubscribed' = 'pending',
): Promise<boolean> {
  const owned = and(eq(subscribers.id, id), eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS), sameClaimClock(claimClock))
  if (created) {
    const removed = await db.delete(subscribers).where(owned).returning({ id: subscribers.id })
    return removed.length === 1
  }
  const released = await db
    .update(subscribers)
    .set({
      status: restore === 'unsubscribed' ? UNSUBSCRIBED_SUBSCRIBER_STATUS : PENDING_SUBSCRIBER_STATUS,
      syncingStartedAt: null,
    })
    .where(owned)
    .returning({ id: subscribers.id })
  return released.length === 1
}

function holdFromStatus(status: string | undefined, beehiivStatus: string | null | undefined): SubscriberHold {
  if (status === FAILED_SUBSCRIBER_STATUS) return { kind: 'terminal', beehiivStatus: beehiivStatus ?? '' }
  if (status === UNSUBSCRIBED_SUBSCRIBER_STATUS) return { kind: 'opted_out' }
  return { kind: 'busy' }
}

async function claimOrDone(db: Database, id: number, now: number): Promise<SubscriberHold> {
  const claimed = await claimPendingSubscriber(db, id, now)
  if (claimed) return { kind: 'held', id, created: false, claimClock: now, restore: 'pending' }
  const again = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS && again[0].destination === 'beehiiv') return { kind: 'done' }
  return holdFromStatus(again[0]?.status, again[0]?.beehiivStatus)
}

async function syncedOrBusy(db: Database, id: number): Promise<SubscriberHold> {
  const again = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1)
  if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS && again[0].destination === 'beehiiv') return { kind: 'done' }
  return holdFromStatus(again[0]?.status, again[0]?.beehiivStatus)
}

async function holdExisting(
  db: Database,
  row: HeldRow,
  now: number,
  fetchImpl?: typeof fetch,
): Promise<SubscriberHold> {
  if (row.status === SYNCED_SUBSCRIBER_STATUS && row.destination === 'beehiiv') return { kind: 'done' }
  if (row.status === FAILED_SUBSCRIBER_STATUS) return { kind: 'terminal', beehiivStatus: row.beehiivStatus ?? '' }
  if (row.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) return { kind: 'opted_out' }
  if (row.status === SYNCING_SUBSCRIBER_STATUS) {
    if (!isSyncingStale(row.syncingStartedAt, now)) return { kind: 'busy' }
    const observedClock = row.syncingStartedAt
    const lookup = await lookupBeehiivSubscriptionByEmail({ email: row.email, fetchImpl })
    if (lookup.outcome === 'found') {
      const action = beehiivFoundAction(lookup.status)
      if (action === 'opt_out') {
        const noted = await noteSubscriberUnsubscribed(db, row.id, lookup.id, observedClock)
        if (noted) return { kind: 'opted_out' }
        const again = await db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
        if (again[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) return { kind: 'opted_out' }
        return syncedOrBusy(db, row.id)
      }
      if (action === 'terminal') {
        const noted = await noteSubscriberTerminal(db, row.id, lookup.id, lookup.status, observedClock)
        if (noted) return { kind: 'terminal', beehiivStatus: lookup.status.trim().toLowerCase() }
        return syncedOrBusy(db, row.id)
      }
      const saved = await finishSubscriberSync(db, row.id, lookup.id, observedClock)
      if (saved) return { kind: 'done' }
      return syncedOrBusy(db, row.id)
    }
    if (lookup.outcome === 'missing') {
      const won = await reclaimStaleSubscriber(db, row.id, observedClock, now)
      if (!won) return syncedOrBusy(db, row.id)
      return { kind: 'held', id: row.id, created: false, claimClock: now, restore: 'pending' }
    }
    return { kind: 'unavailable' }
  }
  if (row.status !== PENDING_SUBSCRIBER_STATUS) return holdFromStatus(row.status, row.beehiivStatus)
  return claimOrDone(db, row.id, now)
}

/** First-touch values for a new subscriber row. Callers pass already-sanitized values. */
export type SubscriberAttribution = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  landing_path?: string
}

const ATTRIBUTION_MAX = 200

function attributionValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, ATTRIBUTION_MAX)
  return trimmed.length > 0 ? trimmed : null
}

/** Column values for an insert. Existing rows are never updated, so the first signup's tags stay. */
export function attributionColumns(attribution: SubscriberAttribution | null | undefined) {
  return {
    utmSource: attributionValue(attribution?.utm_source),
    utmMedium: attributionValue(attribution?.utm_medium),
    utmCampaign: attributionValue(attribution?.utm_campaign),
    utmContent: attributionValue(attribution?.utm_content),
    landingPath: attributionValue(attribution?.landing_path),
  }
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
  attribution: SubscriberAttribution = {},
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
        ...attributionColumns(attribution),
      })
      .returning({ id: subscribers.id })
    const id = inserted[0]?.id
    if (id === undefined) return { kind: 'busy' }
    return { kind: 'held', id, created: true, claimClock: now, restore: 'pending' }
  } catch (error) {
    const again = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1)
    if (!again[0]) throw error
    return holdExisting(db, again[0], now, fetchImpl)
  }
}

async function countSubscribers(db: Database, where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(subscribers).where(where)
  return Number(row?.total ?? 0)
}

function staleSyncingFilter(now: number, staleAfterMs: number): SQL {
  const cutoff = now - staleAfterMs
  return and(
    eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS),
    or(isNull(subscribers.syncingStartedAt), lte(subscribers.syncingStartedAt, cutoff)),
  ) as SQL
}

/**
 * Sends each pending address to Beehiiv with double opt-in. The row is marked syncing
 * before the call, using the clock at claim time. A second run skips rows already synced
 * or still in progress. Dry-run counts rows and does not read email addresses.
 */
export async function backfillPendingSubscribers(input: {
  db: Database
  apply: boolean
  fetchImpl?: typeof fetch
  now?: number
}): Promise<BackfillResult> {
  const pending = await countSubscribers(input.db, eq(subscribers.status, PENDING_SUBSCRIBER_STATUS))
  const syncing = await countSubscribers(input.db, eq(subscribers.status, SYNCING_SUBSCRIBER_STATUS))
  if (!input.apply) {
    return {
      dryRun: true,
      pending,
      syncing,
      synced: 0,
      failed: 0,
      unconfigured: !isBeehiivConfigured(),
    }
  }
  if (!isBeehiivConfigured()) {
    return {
      dryRun: false,
      pending,
      syncing,
      synced: 0,
      failed: pending,
      unconfigured: true,
    }
  }
  const pendingRows = await input.db.select().from(subscribers).where(eq(subscribers.status, PENDING_SUBSCRIBER_STATUS))
  let synced = 0
  let failed = 0
  for (const row of pendingRows) {
    const claimedAt = input.now ?? Date.now()
    const claimed = await claimPendingSubscriber(input.db, row.id, claimedAt)
    if (!claimed) continue
    const remote = await createBeehiivSubscription({
      email: row.email,
      referringSite: absoluteUrl(newsletterReferringPath('newsletter')),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      await releaseSubscriberHold(input.db, row.id, false, claimedAt)
      failed += 1
      continue
    }
    const saved = await finishSubscriberSync(input.db, row.id, remote.id, claimedAt)
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
    syncing,
    synced,
    failed,
    unconfigured: false,
  }
}

/**
 * Looks up each stale syncing row by email. `active`, `validating`, and `pending`
 * (double opt-in waiting) are marked synced and are not posted. `inactive` and
 * `unsubscribed` are recorded as unsubscribed and are not posted. `invalid`, `paused`,
 * `needs_attention`, and any other or empty status are parked as `failed` with Beehiiv's
 * status stored. A missing address returns to pending. Dry-run counts rows and does not
 * read email addresses.
 */
export async function reconcileStuckSubscribers(input: {
  db: Database
  apply: boolean
  now?: number
  staleAfterMs?: number
  fetchImpl?: typeof fetch
}): Promise<ReconcileResult> {
  const now = input.now ?? Date.now()
  const staleAfterMs = stuckAfterFloor(input.staleAfterMs ?? SYNCING_STALE_AFTER_MS)
  const staleFilter = staleSyncingFilter(now, staleAfterMs)
  if (!input.apply) {
    return {
      dryRun: true,
      stale: await countSubscribers(input.db, staleFilter),
      synced: 0,
      released: 0,
      optedOut: 0,
      terminal: 0,
      failed: 0,
      unconfigured: !isBeehiivConfigured(),
    }
  }
  if (!isBeehiivConfigured()) {
    return {
      dryRun: false,
      stale: await countSubscribers(input.db, staleFilter),
      synced: 0,
      released: 0,
      optedOut: 0,
      terminal: 0,
      failed: await countSubscribers(input.db, staleFilter),
      unconfigured: true,
    }
  }
  const staleRows = await input.db.select().from(subscribers).where(staleFilter)
  let synced = 0
  let released = 0
  let optedOut = 0
  let terminal = 0
  let failed = 0
  for (const row of staleRows) {
    const observedClock = row.syncingStartedAt
    const lookup = await lookupBeehiivSubscriptionByEmail({ email: row.email, fetchImpl: input.fetchImpl })
    if (lookup.outcome === 'found') {
      const action = beehiivFoundAction(lookup.status)
      if (action === 'terminal') {
        const noted = await noteSubscriberTerminal(input.db, row.id, lookup.id, lookup.status, observedClock)
        if (noted) {
          terminal += 1
          continue
        }
        const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
        if (again[0]?.status === FAILED_SUBSCRIBER_STATUS) terminal += 1
        else if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
        else failed += 1
        continue
      }
      if (action === 'opt_out') {
        const noted = await noteSubscriberUnsubscribed(input.db, row.id, lookup.id, observedClock)
        if (noted) {
          optedOut += 1
          continue
        }
        const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
        if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
        else if (again[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) optedOut += 1
        else if (again[0]?.status === FAILED_SUBSCRIBER_STATUS) terminal += 1
        else failed += 1
        continue
      }
      const saved = await finishSubscriberSync(input.db, row.id, lookup.id, observedClock)
      if (saved) {
        synced += 1
        continue
      }
      const again = await input.db.select().from(subscribers).where(eq(subscribers.id, row.id)).limit(1)
      if (again[0]?.status === SYNCED_SUBSCRIBER_STATUS) synced += 1
      else if (again[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) optedOut += 1
      else if (again[0]?.status === FAILED_SUBSCRIBER_STATUS) terminal += 1
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
      else if (again[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) optedOut += 1
      else if (again[0]?.status === FAILED_SUBSCRIBER_STATUS) terminal += 1
      else failed += 1
      continue
    }
    failed += 1
  }
  return { dryRun: false, stale: staleRows.length, synced, released, optedOut, terminal, failed, unconfigured: false }
}
