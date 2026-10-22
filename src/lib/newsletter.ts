import { eq } from 'drizzle-orm'
import { createBeehiivSubscription, isBeehiivConfigured } from './beehiiv'
import type { Database } from './db/client'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import type { FirstTouch } from './first-touch'
import { ACTION_LIMITS, allowRate } from './action-limit'
import { newsletterReferringPath, type NewsletterSource } from './newsletter-source'
import { emailSchema, newsletterFieldsSchema } from './validation'
import {
  finishSubscriberSync,
  attributionColumns,
  holdSubscriberForBeehiiv,
  releaseSubscriberHold,
} from './newsletter-backfill'
import {
  ADD_FAILED,
  FAILED_SUBSCRIBER_STATUS,
  PENDING_SUBSCRIBER_STATUS,
  PENDING_SUCCESS,
  RACE_SUCCESS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCED_SUCCESS,
  UNSUBSCRIBED_SUBSCRIBER_STATUS,
  nonAddMessage,
} from './newsletter-status'

export type { BackfillResult, ReconcileResult } from './newsletter-backfill'
export {
  backfillPendingSubscribers,
  beehiivFoundAction,
  isSyncingStale,
  newsletterBackfillAllowed,
  readStuckAfterMs,
  reconcileStuckSubscribers,
  stuckAfterFloor,
} from './newsletter-backfill'
export {
  ADD_FAILED,
  FAILED_NOTICE,
  FAILED_SUBSCRIBER_STATUS,
  PENDING_SUBSCRIBER_STATUS,
  PENDING_SUCCESS,
  RACE_SUCCESS,
  SYNCED_SUBSCRIBER_STATUS,
  SYNCED_SUCCESS,
  SYNCING_STALE_AFTER_MS,
  SYNCING_SUBSCRIBER_STATUS,
  UNSUBSCRIBED_SUBSCRIBER_STATUS,
  nonAddMessage,
} from './newsletter-status'

export type NewsletterResult = {
  status: 'success' | 'error'
  message: string
  tracked: boolean
}

/**
 * Honeypot hits return the same success copy as a real signup and write nothing.
 * Beehiiv is the named Daily Bot provider. When either env var is unset, the
 * address is stored as pending and left out of subscriber counts. A pending
 * signup is not a GA event. Logs never include the address.
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
  /** Exact in-scope page path from the newsletter CTA. Overrides the source's fixed path for referring_site. */
  referringPath?: string
  /** Sanitized first-touch record from the form, or null. */
  firstTouch?: FirstTouch | null
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

  const allowed = await allowRate(input.db, input.rateKey, ACTION_LIMITS.newsletter.limit, ACTION_LIMITS.newsletter.windowMs, {
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
  if (existing[0]?.status === FAILED_SUBSCRIBER_STATUS) {
    return { status: 'error', message: nonAddMessage(existing[0].beehiivStatus), tracked: false }
  }
  if (existing[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) {
    return { status: 'error', message: ADD_FAILED, tracked: false }
  }

  if (isBeehiivConfigured()) {
    const held = await holdSubscriberForBeehiiv(
      input.db,
      normalized,
      input.now ?? Date.now(),
      input.fetchImpl,
      input.firstTouch ?? null,
    )
    if (held.kind === 'done') return { status: 'success', message: SYNCED_SUCCESS, tracked: false }
    if (held.kind === 'opted_out') {
      return { status: 'error', message: ADD_FAILED, tracked: false }
    }
    if (held.kind === 'terminal') {
      return { status: 'error', message: nonAddMessage(held.beehiivStatus), tracked: false }
    }
    if (held.kind === 'busy') {
      return { status: 'success', message: RACE_SUCCESS, tracked: false }
    }
    if (held.kind === 'unavailable') {
      return { status: 'error', message: ADD_FAILED, tracked: false }
    }
    const remote = await createBeehiivSubscription({
      email: normalized,
      referringSite: absoluteUrl(input.referringPath ?? newsletterReferringPath(input.source ?? 'newsletter')),
      firstTouch: input.firstTouch ?? null,
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      await releaseSubscriberHold(input.db, held.id, held.created, held.claimClock, held.restore)
      return { status: 'error', message: ADD_FAILED, tracked: false }
    }
    const saved = await finishSubscriberSync(input.db, held.id, remote.id, held.claimClock)
    if (!saved) {
      return { status: 'success', message: RACE_SUCCESS, tracked: false }
    }
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
    ...attributionColumns(input.firstTouch),
  })
  return { status: 'success', message: PENDING_SUCCESS, tracked: false }
}

/** Pending and in-progress rows are not subscribers yet. Only Beehiiv-synced rows are counted. */
export async function countSyncedSubscribers(db: Database): Promise<number> {
  const rows = await db.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.status, SYNCED_SUBSCRIBER_STATUS))
  return rows.length
}
