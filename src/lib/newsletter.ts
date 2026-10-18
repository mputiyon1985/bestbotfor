import { eq } from 'drizzle-orm'
import { createBeehiivSubscription, isBeehiivConfigured } from './beehiiv'
import type { Database } from './db'
import { dbHost, isProdHost } from './db/guard'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import { allowRate } from './action-limit'
import { newsletterReferringPath, type NewsletterSource } from './newsletter-source'
import { emailSchema, newsletterFieldsSchema } from './validation'

export type NewsletterResult = {
  status: 'success' | 'error'
  message: string
  tracked: boolean
}

/** Saved locally. Not sent to Beehiiv, so it is not synced and not subscribed. */
export const PENDING_SUBSCRIBER_STATUS = 'pending'

/** Beehiiv accepted the address with double opt-in. This is the only counted status. */
export const SYNCED_SUBSCRIBER_STATUS = 'synced'

export const SYNCED_SUCCESS = "Thanks. You're on the list."

export const PENDING_SUCCESS = "You'll get a confirmation email when The Daily Bot launches."

export type BackfillResult = {
  dryRun: boolean
  pending: number
  synced: number
  failed: number
  unconfigured: boolean
}

/**
 * Honeypot hits return the same success copy as a real signup and write nothing.
 * Beehiiv is the named Daily Bot provider. When either env var is unset, the
 * address is stored as pending and left out of subscriber counts. Logs never
 * include the address.
 */

function successMessage(): string {
  return isBeehiivConfigured() ? SYNCED_SUCCESS : PENDING_SUCCESS
}

function isSyncedToBeehiiv(row: { status: string; destination: string }): boolean {
  return row.status === SYNCED_SUBSCRIBER_STATUS && row.destination === 'beehiiv'
}

export async function subscribeToNewsletter(input: {
  email: string
  honeypot: string
  db: Database
  rateKey: string
  source?: NewsletterSource
  fetchImpl?: typeof fetch
  now?: number
}): Promise<NewsletterResult> {
  const fields = newsletterFieldsSchema.safeParse({
    email: input.email,
    company_website: input.honeypot,
  })
  if (!fields.success) {
    return { status: 'error', message: 'Check the email address and try again.', tracked: false }
  }

  const allowed = await allowRate(input.db, input.rateKey, 5, 60 * 60 * 1000, {
    onError: 'closed',
    now: input.now,
  })
  if (allowed === 'unavailable') {
    return { status: 'error', message: 'Signup is temporarily unavailable. Try again.', tracked: false }
  }
  if (allowed === 'limit') {
    return { status: 'error', message: 'Too many signup attempts. Try again in an hour.', tracked: false }
  }

  if (fields.data.company_website.trim() !== '') {
    return { status: 'success', message: successMessage(), tracked: false }
  }

  const email = emailSchema.safeParse(fields.data.email)
  if (!email.success) {
    return { status: 'error', message: 'Enter a valid email address.', tracked: false }
  }

  const normalized = email.data.toLowerCase()
  const existing = await input.db.select().from(subscribers).where(eq(subscribers.email, normalized)).limit(1)
  if (existing[0] && isSyncedToBeehiiv(existing[0])) {
    return { status: 'success', message: SYNCED_SUCCESS, tracked: false }
  }

  if (isBeehiivConfigured()) {
    const remote = await createBeehiivSubscription({
      email: normalized,
      referringSite: absoluteUrl(newsletterReferringPath(input.source ?? 'newsletter')),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      return {
        status: 'error',
        message: "We couldn't add you just now. Try again in a few minutes.",
        tracked: false,
      }
    }
    if (existing[0]) {
      await input.db
        .update(subscribers)
        .set({ destination: 'beehiiv', beehiivId: remote.id, status: SYNCED_SUBSCRIBER_STATUS })
        .where(eq(subscribers.id, existing[0].id))
      return { status: 'success', message: SYNCED_SUCCESS, tracked: false }
    }
    await input.db.insert(subscribers).values({
      email: normalized,
      createdAt: input.now ?? Date.now(),
      destination: 'beehiiv',
      beehiivId: remote.id,
      status: SYNCED_SUBSCRIBER_STATUS,
    })
    return { status: 'success', message: SYNCED_SUCCESS, tracked: true }
  }

  if (existing[0]) {
    return { status: 'success', message: PENDING_SUCCESS, tracked: false }
  }
  await input.db.insert(subscribers).values({
    email: normalized,
    createdAt: input.now ?? Date.now(),
    destination: 'local',
    beehiivId: null,
    status: PENDING_SUBSCRIBER_STATUS,
  })
  return { status: 'success', message: PENDING_SUCCESS, tracked: true }
}

/** Pending rows are not subscribers yet. Only Beehiiv-synced rows are counted. */
export async function countSyncedSubscribers(db: Database): Promise<number> {
  const rows = await db.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.status, SYNCED_SUBSCRIBER_STATUS))
  return rows.length
}

/** Dry-run is the default. Production and the production database are refused by the script. */
export function newsletterBackfillAllowed(input: {
  vercelEnv: string | undefined
  databaseUrl: string | undefined
}): { ok: true } | { ok: false; reason: string } {
  if ((input.vercelEnv ?? '').trim() === 'production') {
    return { ok: false, reason: 'Newsletter backfill does not run in production.' }
  }
  const url = input.databaseUrl?.trim() ?? ''
  if (!url) return { ok: false, reason: 'Set TURSO_DATABASE_URL before the newsletter backfill.' }
  const host = dbHost(url)
  if (host && isProdHost(host)) {
    return { ok: false, reason: 'Newsletter backfill does not run against the production database.' }
  }
  return { ok: true }
}

/**
 * Sends each pending address to Beehiiv with double opt-in. A second run skips
 * rows already synced. Dry-run counts them and does not call Beehiiv.
 */
export async function backfillPendingSubscribers(input: {
  db: Database
  apply: boolean
  fetchImpl?: typeof fetch
}): Promise<BackfillResult> {
  const pendingRows = await input.db.select().from(subscribers).where(eq(subscribers.status, PENDING_SUBSCRIBER_STATUS))
  if (!input.apply) {
    return { dryRun: true, pending: pendingRows.length, synced: 0, failed: 0, unconfigured: !isBeehiivConfigured() }
  }
  if (!isBeehiivConfigured()) {
    return { dryRun: false, pending: pendingRows.length, synced: 0, failed: pendingRows.length, unconfigured: true }
  }
  let synced = 0
  let failed = 0
  for (const row of pendingRows) {
    const remote = await createBeehiivSubscription({
      email: row.email,
      referringSite: absoluteUrl(newsletterReferringPath('newsletter')),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      failed += 1
      continue
    }
    await input.db
      .update(subscribers)
      .set({ destination: 'beehiiv', beehiivId: remote.id, status: SYNCED_SUBSCRIBER_STATUS })
      .where(eq(subscribers.id, row.id))
    synced += 1
  }
  return { dryRun: false, pending: pendingRows.length, synced, failed, unconfigured: false }
}
