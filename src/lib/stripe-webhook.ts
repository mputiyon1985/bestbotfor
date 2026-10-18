import { and, eq, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { z } from 'zod'
import type { Database } from './db'
import { sponsorships, stripeEvents, subscriptions } from './db/schema'
import { getDb } from './db'
import { isDeadline, withDeadline } from './deadline'
import {
  sponsorOffering,
  sponsorPriceId,
  sponsorPriceLockMonths,
  sponsorSetupPriceId,
  type SubscriptionSponsorOffering,
} from './sponsor-offerings'
import { getStripe, stripeWebhookSecret } from './stripe'
import { liveModeAllowed } from './stripe-key'
import { sanitizeSponsorCompany } from './sponsor-company'
import { linkSponsorCreative } from './sponsor-card'

const WEBHOOK_DB_BUDGET_MS = 2_000

const checkoutSchema = z.object({
  mode: z.string().optional(),
  customer: z.string().nullable().optional(),
  subscription: z.string().nullable().optional(),
  metadata: z.object({ clerkUserId: z.string().min(1).max(200).optional() }).optional(),
})

const subscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string(), z.object({ id: z.string() })]).optional(),
  status: z.string().min(1),
  metadata: z.object({ clerkUserId: z.string().min(1).max(200).optional() }).optional(),
  items: z
    .object({
      data: z
        .array(
          z.object({
            current_period_end: z.number().optional(),
            price: z.object({ id: z.string().optional() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
})

export type WebhookResult = { status: number; body: Record<string, unknown> }

/**
 * Verify the Stripe signature before touching the body as JSON.
 * The event id is claimed first with processedAt 0. The timestamp is set
 * only after the subscription write succeeds. A retry of a finished event
 * returns 200 without applying again. A retry of an unfinished claim still
 * applies, including when the timeout cleanup could not delete the row.
 * If applying fails, the unfinished event row (processed_at = 0) is removed so
 * Stripe can retry safely. A finished claim is left in place.
 */
export async function handleStripeWebhook(input: {
  rawBody: string
  signature: string | null
  db?: Database
  stripe?: Stripe | null
  secret?: string | null
  deadlineMs?: number
  allowLive?: boolean
  /** Clock for sponsorship paid_at, refunded_at, and updated_at. Defaults to Date.now(). */
  now?: number
}): Promise<WebhookResult> {
  const stripe = input.stripe === undefined ? getStripe() : input.stripe
  const secret = input.secret === undefined ? stripeWebhookSecret() : input.secret
  if (!stripe || !secret) {
    return { status: 503, body: { error: 'billing-disabled' } }
  }
  if (!input.signature) {
    return { status: 400, body: { error: 'invalid-signature' } }
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(input.rawBody, input.signature, secret)
  } catch {
    return { status: 400, body: { error: 'invalid-signature' } }
  }

  const allowLive = input.allowLive ?? liveModeAllowed()
  if (event.livemode && !allowLive) {
    return { status: 400, body: { error: 'live-mode-rejected' } }
  }

  const db = input.db ?? getDb()
  const deadlineMs = input.deadlineMs ?? WEBHOOK_DB_BUDGET_MS

  try {
    const outcome = await withDeadline(applyWebhook(db, stripe, event, input.now), deadlineMs)
    if (outcome === 'duplicate') return { status: 200, body: { received: true, duplicate: true } }
    return { status: 200, body: { received: true } }
  } catch (error) {
    if (isDeadline(error)) {
      try {
        await withDeadline(deleteUnfinishedClaim(db, event.id), Math.min(deadlineMs, 300))
      } catch (cleanup) {
        console.error('stripe webhook cleanup failed', cleanup instanceof Error ? cleanup.name : 'error')
      }
      return { status: 500, body: { error: 'webhook-timeout' } }
    }
    console.error('stripe webhook apply failed', event.type)
    throw error
  }
}

function deleteUnfinishedClaim(db: Database, eventId: string) {
  return db
    .delete(stripeEvents)
    .where(and(eq(stripeEvents.id, eventId), eq(stripeEvents.processedAt, 0)))
}

async function applyWebhook(
  db: Database,
  stripe: Stripe,
  event: Stripe.Event,
  now?: number,
): Promise<'ok' | 'duplicate'> {
  const inserted = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, processedAt: 0 })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id })

  if (inserted.length === 0) {
    const existing = await db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id))
    if (existing[0] && existing[0].processedAt > 0) return 'duplicate'
  }

  try {
    await applyEvent(db, stripe, event, now)
    await db.update(stripeEvents).set({ processedAt: Date.now() }).where(eq(stripeEvents.id, event.id))
  } catch (error) {
    await deleteUnfinishedClaim(db, event.id)
    throw error
  }
  return 'ok'
}

/** Events the test-mode webhook is subscribed to for sponsor refunds. */
export const SPONSOR_REFUND_WEBHOOK_EVENTS = ['charge.refunded', 'refund.created', 'refund.updated'] as const

/**
 * Events the webhook endpoint must send for sponsor subscriptions
 * (founding_sponsor, placement_subscription), on top of the checkout and
 * refund events. The post-merge runbook adds these to the live endpoint.
 */
export const SPONSOR_SUBSCRIPTION_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const

const KNOWN_EVENT_TYPES = new Set<string>([
  ...SPONSOR_SUBSCRIPTION_WEBHOOK_EVENTS,
  ...SPONSOR_REFUND_WEBHOOK_EVENTS,
])

const stripeRef = z.union([z.string(), z.object({ id: z.string() })]).nullable().optional()

const sponsorshipCheckoutSchema = z.object({
  id: z.string().min(1).max(255),
  mode: z.string().optional(),
  subscription: stripeRef,
  payment_status: z.string().optional(),
  customer: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  payment_intent: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  customer_email: z.string().max(320).nullable().optional(),
  amount_total: z.number().int().nullable().optional(),
  currency: z.string().max(12).nullable().optional(),
  metadata: z
    .object({
      kind: z.literal('sponsorship'),
      offering: z.string().min(1).max(80),
      email: z.string().max(320).optional(),
      company: z.string().max(200).optional(),
      task_slug: z.string().max(80).optional(),
      issue_date: z.string().max(40).optional(),
      price_id: z.string().max(255).optional(),
      creative_id: z.string().max(20).optional(),
    })
    .optional(),
})

function isSponsorshipEvent(event: Stripe.Event): boolean {
  if (!KNOWN_EVENT_TYPES.has(event.type) || !event.type.startsWith('checkout.session.')) return false
  const object = event.data?.object
  if (!object || typeof object !== 'object' || !('metadata' in object)) return false
  const metadata = object.metadata
  return Boolean(metadata && typeof metadata === 'object' && 'kind' in metadata && metadata.kind === 'sponsorship')
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function sponsorshipStatus(type: string, paymentStatus: string | undefined): 'pending' | 'paid' | 'failed' {
  if (type === 'checkout.session.async_payment_failed') return 'failed'
  if (type === 'checkout.session.async_payment_succeeded') return paymentStatus === 'unpaid' ? 'pending' : 'paid'
  return paymentStatus === 'paid' ? 'paid' : 'pending'
}

function sponsorshipLine(session: Stripe.Checkout.Session): { priceId: string | null; quantity: number | null } {
  const items = session.line_items?.data ?? []
  if (items.length !== 1) return { priceId: null, quantity: null }
  const item = items[0]
  if (!item) return { priceId: null, quantity: null }
  const price = item.price
  const priceId = !price ? null : typeof price === 'string' ? price : price.id
  const quantity = typeof item.quantity === 'number' ? item.quantity : null
  return { priceId, quantity }
}

async function applySponsorship(db: Database, stripe: Stripe, event: Stripe.Event, clock?: number): Promise<void> {
  const parsed = sponsorshipCheckoutSchema.safeParse(event.data.object)
  if (!parsed.success || parsed.data.metadata?.kind !== 'sponsorship') {
    throw new Error('sponsorship payload failed validation')
  }
  const offering = sponsorOffering(parsed.data.metadata.offering)
  if (!offering) throw new Error('sponsorship payload failed validation')
  if (offering.billing === 'subscription') {
    await applySponsorSubscriptionCheckout(db, stripe, event, parsed.data, offering, clock)
    return
  }
  if (parsed.data.mode !== undefined && parsed.data.mode !== 'payment') throw new Error('sponsorship mode mismatch')
  const expectedPriceId = sponsorPriceId(offering.id)
  if (!expectedPriceId) throw new Error('sponsorship price is not configured')
  const session = await stripe.checkout.sessions.retrieve(parsed.data.id, { expand: ['line_items'] })
  const line = sponsorshipLine(session)
  if (session.id !== parsed.data.id || line.priceId !== expectedPriceId) {
    throw new Error('sponsorship price mismatch')
  }
  if (line.quantity !== 1) throw new Error('sponsorship quantity mismatch')
  const now = clock ?? Date.now()
  const status = sponsorshipStatus(event.type, parsed.data.payment_status)
  const company = sanitizeSponsorCompany(parsed.data.metadata.company ?? '')
  await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: parsed.data.id,
      stripePaymentIntentId: stripeId(parsed.data.payment_intent),
      stripeCustomerId: stripeId(parsed.data.customer),
      stripePriceId: expectedPriceId,
      offering: offering.id,
      status,
      email: parsed.data.customer_email ?? parsed.data.metadata.email ?? null,
      company: company.length > 0 ? company : null,
      taskSlug: parsed.data.metadata.task_slug || null,
      issueDate: parsed.data.metadata.issue_date || null,
      amountTotal: parsed.data.amount_total ?? null,
      currency: parsed.data.currency ?? null,
      createdAt: now,
      updatedAt: now,
      paidAt: status === 'paid' ? now : null,
    })
    .onConflictDoUpdate({
      target: sponsorships.stripeCheckoutSessionId,
      set: {
        stripePaymentIntentId: sql`coalesce(excluded.stripe_payment_intent_id, ${sponsorships.stripePaymentIntentId})`,
        stripeCustomerId: sql`coalesce(excluded.stripe_customer_id, ${sponsorships.stripeCustomerId})`,
        stripePriceId: sql`coalesce(excluded.stripe_price_id, ${sponsorships.stripePriceId})`,
        status: sql`CASE
          WHEN ${sponsorships.status} = 'paid' OR excluded.status = 'paid' THEN 'paid'
          WHEN ${sponsorships.status} = 'failed' AND excluded.status = 'pending' THEN ${sponsorships.status}
          ELSE excluded.status
        END`,
        email: sql`coalesce(excluded.email, ${sponsorships.email})`,
        company: sql`coalesce(excluded.company, ${sponsorships.company})`,
        taskSlug: sql`coalesce(excluded.task_slug, ${sponsorships.taskSlug})`,
        issueDate: sql`coalesce(excluded.issue_date, ${sponsorships.issueDate})`,
        amountTotal: sql`coalesce(excluded.amount_total, ${sponsorships.amountTotal})`,
        currency: sql`coalesce(excluded.currency, ${sponsorships.currency})`,
        paidAt: sql`CASE
          WHEN ${sponsorships.paidAt} IS NOT NULL THEN ${sponsorships.paidAt}
          WHEN ${sponsorships.status} = 'paid' OR excluded.status = 'paid' THEN ${now}
          ELSE NULL
        END`,
        updatedAt: now,
      },
    })
  await linkSponsorCreative(db, {
    creativeId: parsed.data.metadata.creative_id,
    sessionId: parsed.data.id,
    now,
  })
}

type SponsorshipCheckout = z.infer<typeof sponsorshipCheckoutSchema>

function sessionLines(session: Stripe.Checkout.Session): Array<{ priceId: string | null; quantity: number | null }> {
  return (session.line_items?.data ?? []).map((item) => {
    const price = item.price
    return {
      priceId: !price ? null : typeof price === 'string' ? price : price.id,
      quantity: typeof item.quantity === 'number' ? item.quantity : null,
    }
  })
}

function secondsToMs(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : null
}

/** Calendar months after a UTC instant, clamped to the last day of the target month. */
export function addUtcMonths(ms: number, months: number): number {
  const start = new Date(ms)
  const target = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + months,
      1,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  )
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay))
  return target.getTime()
}

type SubscriptionSnapshot = {
  status: string
  paidThrough: number | null
  cancelAt: number | null
  canceledAt: number | null
  startMs: number | null
}

/** Paid-through, cancel, and status fields read from a retrieved Subscription. */
function subscriptionSnapshot(subscription: Stripe.Subscription, expectedPriceId: string): SubscriptionSnapshot {
  const items = subscription.items?.data ?? []
  const item = items.find((entry) => entry.price?.id === expectedPriceId)
  if (!item) throw new Error('sponsorship subscription price mismatch')
  if (typeof item.quantity === 'number' && item.quantity !== 1) throw new Error('sponsorship quantity mismatch')
  const periodEnd = secondsToMs(item.current_period_end)
  const trialEnd = secondsToMs(subscription.trial_end)
  // Trialing: the founding $99 paid for the trial, so the placement runs to
  // trial_end. Active: the first period's invoice was paid at checkout.
  // past_due: the current period's invoice is unpaid, so only the time up to
  // the start of that period was paid for.
  let paidThrough: number | null = null
  if (subscription.status === 'trialing') paidThrough = trialEnd
  else if (subscription.status === 'active') paidThrough = periodEnd
  else if (subscription.status === 'past_due') paidThrough = secondsToMs(item.current_period_start)
  let cancelAt = secondsToMs(subscription.cancel_at)
  if (cancelAt == null && subscription.cancel_at_period_end) cancelAt = periodEnd
  return {
    status: subscription.status,
    paidThrough,
    cancelAt,
    canceledAt: secondsToMs(subscription.canceled_at),
    startMs: secondsToMs(subscription.start_date),
  }
}

/**
 * checkout.session.completed (and the async variants) for a sponsor
 * subscription. The session and the Subscription are both re-read from
 * Stripe, so the row reflects Stripe's current state even when this event is
 * processed after invoice.paid or customer.subscription.updated. The prices
 * on the session must be exactly the server-configured recurring Price, plus
 * the setup Price for the founding offer, each with quantity 1.
 */
async function applySponsorSubscriptionCheckout(
  db: Database,
  stripe: Stripe,
  event: Stripe.Event,
  data: SponsorshipCheckout,
  offering: SubscriptionSponsorOffering,
  clock?: number,
): Promise<void> {
  if (data.mode !== 'subscription') throw new Error('sponsorship mode mismatch')
  const metadata = data.metadata
  if (!metadata) throw new Error('sponsorship payload failed validation')
  const expectedPriceId = sponsorPriceId(offering.id)
  if (!expectedPriceId) throw new Error('sponsorship price is not configured')
  const expectedSetupId = 'setup' in offering ? sponsorSetupPriceId(offering.id) : null
  if ('setup' in offering && !expectedSetupId) throw new Error('sponsorship price is not configured')

  const session = await stripe.checkout.sessions.retrieve(data.id, { expand: ['line_items'] })
  if (session.id !== data.id) throw new Error('sponsorship price mismatch')
  const lines = sessionLines(session)
  const expected = [expectedPriceId, ...(expectedSetupId ? [expectedSetupId] : [])].sort()
  const actual = lines.map((line) => line.priceId ?? '').sort()
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error('sponsorship price mismatch')
  }
  if (lines.some((line) => line.quantity !== 1)) throw new Error('sponsorship quantity mismatch')

  const now = clock ?? Date.now()
  const status = sponsorshipStatus(event.type, data.payment_status === 'no_payment_required' ? 'paid' : data.payment_status)
  const subscriptionId = stripeId(data.subscription) ?? stripeId(session.subscription as string | { id: string } | null)
  if (!subscriptionId) {
    // An async payment can fail before Stripe creates the subscription. Record the failed row only.
    if (status !== 'failed') throw new Error('sponsorship subscription missing')
  }
  let snapshot: SubscriptionSnapshot | null = null
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    if (subscription.id !== subscriptionId) throw new Error('sponsorship subscription mismatch')
    const subscriptionKind = subscription.metadata?.kind
    const subscriptionOffering = subscription.metadata?.offering
    if (subscriptionKind !== 'sponsorship' || subscriptionOffering !== offering.id) {
      throw new Error('sponsorship subscription mismatch')
    }
    snapshot = subscriptionSnapshot(subscription, expectedPriceId)
  }
  const lockMonths = sponsorPriceLockMonths(offering)
  const priceLockedUntil = lockMonths > 0 && snapshot?.startMs != null ? addUtcMonths(snapshot.startMs, lockMonths) : null
  const paidThrough = status === 'paid' ? snapshot?.paidThrough ?? null : null
  const company = sanitizeSponsorCompany(metadata.company ?? '')

  await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: data.id,
      stripePaymentIntentId: null,
      stripeCustomerId: stripeId(data.customer),
      stripePriceId: expectedPriceId,
      offering: offering.id,
      status,
      email: data.customer_email ?? metadata.email ?? null,
      company: company.length > 0 ? company : null,
      taskSlug: metadata.task_slug || null,
      issueDate: null,
      amountTotal: data.amount_total ?? null,
      currency: data.currency ?? null,
      createdAt: now,
      updatedAt: now,
      paidAt: status === 'paid' ? now : null,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: snapshot?.status ?? null,
      paidThrough,
      priceLockedUntil,
      cancelAt: snapshot?.cancelAt ?? null,
      canceledAt: snapshot?.canceledAt ?? null,
      subscriptionEventAt: snapshot ? now : null,
    })
    .onConflictDoUpdate({
      target: sponsorships.stripeCheckoutSessionId,
      set: {
        stripeCustomerId: sql`coalesce(excluded.stripe_customer_id, ${sponsorships.stripeCustomerId})`,
        stripePriceId: sql`coalesce(excluded.stripe_price_id, ${sponsorships.stripePriceId})`,
        status: sql`CASE
          WHEN ${sponsorships.status} = 'paid' OR excluded.status = 'paid' THEN 'paid'
          WHEN ${sponsorships.status} = 'failed' AND excluded.status = 'pending' THEN ${sponsorships.status}
          ELSE excluded.status
        END`,
        email: sql`coalesce(excluded.email, ${sponsorships.email})`,
        company: sql`coalesce(excluded.company, ${sponsorships.company})`,
        taskSlug: sql`coalesce(excluded.task_slug, ${sponsorships.taskSlug})`,
        amountTotal: sql`coalesce(excluded.amount_total, ${sponsorships.amountTotal})`,
        currency: sql`coalesce(excluded.currency, ${sponsorships.currency})`,
        paidAt: sql`CASE
          WHEN ${sponsorships.paidAt} IS NOT NULL THEN ${sponsorships.paidAt}
          WHEN ${sponsorships.status} = 'paid' OR excluded.status = 'paid' THEN ${now}
          ELSE NULL
        END`,
        stripeSubscriptionId: sql`coalesce(excluded.stripe_subscription_id, ${sponsorships.stripeSubscriptionId})`,
        paidThrough: sql`CASE
          WHEN excluded.paid_through IS NULL THEN ${sponsorships.paidThrough}
          WHEN ${sponsorships.paidThrough} IS NULL THEN excluded.paid_through
          ELSE max(${sponsorships.paidThrough}, excluded.paid_through)
        END`,
        priceLockedUntil: sql`coalesce(${sponsorships.priceLockedUntil}, excluded.price_locked_until)`,
        // The re-read Subscription is current as of now. It replaces older
        // status fields, and a canceled row never returns to another status.
        subscriptionStatus: sql`CASE
          WHEN ${sponsorships.subscriptionStatus} = 'canceled' THEN ${sponsorships.subscriptionStatus}
          WHEN excluded.subscription_event_at IS NULL THEN ${sponsorships.subscriptionStatus}
          WHEN ${sponsorships.subscriptionEventAt} IS NULL OR ${sponsorships.subscriptionEventAt} <= excluded.subscription_event_at THEN excluded.subscription_status
          ELSE ${sponsorships.subscriptionStatus}
        END`,
        cancelAt: sql`CASE
          WHEN excluded.subscription_event_at IS NULL THEN ${sponsorships.cancelAt}
          WHEN ${sponsorships.subscriptionEventAt} IS NULL OR ${sponsorships.subscriptionEventAt} <= excluded.subscription_event_at THEN excluded.cancel_at
          ELSE ${sponsorships.cancelAt}
        END`,
        canceledAt: sql`coalesce(${sponsorships.canceledAt}, excluded.canceled_at)`,
        subscriptionEventAt: sql`CASE
          WHEN excluded.subscription_event_at IS NULL THEN ${sponsorships.subscriptionEventAt}
          WHEN ${sponsorships.subscriptionEventAt} IS NULL THEN excluded.subscription_event_at
          ELSE max(${sponsorships.subscriptionEventAt}, excluded.subscription_event_at)
        END`,
        updatedAt: now,
      },
    })
  await linkSponsorCreative(db, {
    creativeId: metadata.creative_id,
    sessionId: data.id,
    now,
  })
}

const invoiceSchema = z.object({
  id: z.string().min(1).max(255),
  subscription: stripeRef,
  parent: z
    .object({
      subscription_details: z
        .object({
          subscription: stripeRef,
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  lines: z
    .object({
      data: z.array(
        z.object({
          period: z.object({ start: z.number().optional(), end: z.number().optional() }).nullable().optional(),
        }),
      ),
    })
    .nullable()
    .optional(),
})

/** Subscription id on an invoice. Newer API versions use parent.subscription_details. */
function invoiceSubscriptionId(invoice: z.infer<typeof invoiceSchema>): string | null {
  return stripeId(invoice.parent?.subscription_details?.subscription) ?? stripeId(invoice.subscription)
}

/**
 * invoice.paid extends paid_through to the latest line period end (a renewal
 * moves it one month forward) and clears a past payment failure.
 * invoice.payment_failed records the failure and marks a renewing row
 * past_due, so the renewal grace stops and the card ends at paid_through.
 * An invoice for a subscription with no sponsor row (a membership, or a
 * sponsor checkout whose completed event has not been processed yet) changes
 * nothing; the checkout handler re-reads the Subscription when it runs.
 *
 * Both are safe out of order:
 * - A canceled row is final. A later invoice.paid does not move paid_through,
 *   and a scheduled cancel caps paid_through at cancel_at.
 * - invoice.paid clears a failure only when the paid event is at least as new
 *   as the failure (payment_failed_at is the failed event's created time).
 * - invoice.payment_failed is ignored when its period already ends on or
 *   before paid_through (a newer invoice.paid already paid that period), or
 *   when it is older than the failure already recorded.
 */
async function applySponsorInvoice(db: Database, event: Stripe.Event, now: number): Promise<void> {
  const parsed = invoiceSchema.safeParse(event.data?.object)
  if (!parsed.success) throw new Error('invoice payload failed validation')
  const subscriptionId = invoiceSubscriptionId(parsed.data)
  if (!subscriptionId) return
  const eventAt = secondsToMs(event.created) ?? now
  const ends = (parsed.data.lines?.data ?? [])
    .map((line) => secondsToMs(line.period?.end))
    .filter((value): value is number => value != null)
  const periodEnd = ends.length > 0 ? Math.max(...ends) : null
  const notCanceled = or(isNull(sponsorships.subscriptionStatus), ne(sponsorships.subscriptionStatus, 'canceled'))
  if (event.type === 'invoice.paid') {
    const failureIsOlder = sql`(${sponsorships.paymentFailedAt} IS NULL OR ${sponsorships.paymentFailedAt} <= ${eventAt})`
    await db
      .update(sponsorships)
      .set({
        status: 'paid',
        paidAt: sql`coalesce(${sponsorships.paidAt}, ${now})`,
        paidThrough:
          periodEnd == null
            ? sql`${sponsorships.paidThrough}`
            : sql`CASE
                WHEN ${sponsorships.paidThrough} IS NULL THEN ${periodEnd}
                WHEN ${sponsorships.cancelAt} IS NOT NULL THEN
                  max(${sponsorships.paidThrough}, min(${periodEnd}, ${sponsorships.cancelAt}))
                ELSE max(${sponsorships.paidThrough}, ${periodEnd})
              END`,
        paymentFailedAt: sql`CASE WHEN ${failureIsOlder} THEN NULL ELSE ${sponsorships.paymentFailedAt} END`,
        subscriptionStatus: sql`CASE
          WHEN ${sponsorships.subscriptionStatus} = 'past_due' AND ${failureIsOlder} THEN 'active'
          ELSE ${sponsorships.subscriptionStatus}
        END`,
        updatedAt: now,
      })
      .where(and(eq(sponsorships.stripeSubscriptionId, subscriptionId), ne(sponsorships.status, 'failed'), notCanceled))
    return
  }
  const conditions = [
    eq(sponsorships.stripeSubscriptionId, subscriptionId),
    notCanceled,
    or(isNull(sponsorships.paymentFailedAt), lte(sponsorships.paymentFailedAt, eventAt)),
  ]
  if (periodEnd != null) {
    conditions.push(sql`(${sponsorships.paidThrough} IS NULL OR ${sponsorships.paidThrough} < ${periodEnd})`)
  }
  await db
    .update(sponsorships)
    .set({
      paymentFailedAt: eventAt,
      subscriptionStatus: sql`CASE
        WHEN ${sponsorships.subscriptionStatus} IN ('active', 'trialing') THEN 'past_due'
        ELSE ${sponsorships.subscriptionStatus}
      END`,
      updatedAt: now,
    })
    .where(and(...conditions))
}

const sponsorSubscriptionSchema = z.object({
  id: z.string().min(1).max(255),
  status: z.string().min(1).max(40),
  cancel_at: z.number().nullable().optional(),
  cancel_at_period_end: z.boolean().nullable().optional(),
  canceled_at: z.number().nullable().optional(),
  ended_at: z.number().nullable().optional(),
  metadata: z.object({ kind: z.literal('sponsorship') }),
  items: z
    .object({
      data: z.array(z.object({ current_period_end: z.number().optional() })).optional(),
    })
    .optional(),
})

function isSponsorSubscriptionEvent(event: Stripe.Event): boolean {
  if (!event.type.startsWith('customer.subscription.')) return false
  const object = event.data?.object
  if (!object || typeof object !== 'object' || !('metadata' in object)) return false
  const metadata = object.metadata
  return Boolean(metadata && typeof metadata === 'object' && 'kind' in metadata && metadata.kind === 'sponsorship')
}

/**
 * customer.subscription.created/updated/deleted for a sponsor subscription.
 * Updates the status, the scheduled cancel, and canceled_at on the matching
 * row. An event older than the last applied one is ignored, and a canceled
 * row stays canceled. deleted is terminal: it also ends the placement at
 * ended_at when that is before paid_through (an immediate cancel). A
 * cancel at period end keeps the placement to the end of the paid month.
 */
async function applySponsorSubscriptionEvent(db: Database, event: Stripe.Event, now: number): Promise<void> {
  const parsed = sponsorSubscriptionSchema.safeParse(event.data?.object)
  if (!parsed.success) throw new Error('subscription payload failed validation')
  const data = parsed.data
  const eventAt = secondsToMs(event.created) ?? now
  const periodEnd = secondsToMs(data.items?.data?.[0]?.current_period_end)
  let cancelAt = secondsToMs(data.cancel_at)
  if (cancelAt == null && data.cancel_at_period_end) cancelAt = periodEnd
  if (event.type === 'customer.subscription.deleted') {
    const ended = secondsToMs(data.ended_at) ?? secondsToMs(data.canceled_at) ?? eventAt
    await db
      .update(sponsorships)
      .set({
        subscriptionStatus: 'canceled',
        canceledAt: sql`coalesce(${sponsorships.canceledAt}, ${secondsToMs(data.canceled_at) ?? ended})`,
        cancelAt: null,
        paidThrough: sql`CASE
          WHEN ${sponsorships.paidThrough} IS NULL THEN NULL
          WHEN ${sponsorships.paidThrough} > ${ended} THEN ${ended}
          ELSE ${sponsorships.paidThrough}
        END`,
        subscriptionEventAt: sql`CASE
          WHEN ${sponsorships.subscriptionEventAt} IS NULL THEN ${eventAt}
          ELSE max(${sponsorships.subscriptionEventAt}, ${eventAt})
        END`,
        updatedAt: now,
      })
      .where(eq(sponsorships.stripeSubscriptionId, data.id))
    return
  }
  await db
    .update(sponsorships)
    .set({
      subscriptionStatus: data.status,
      cancelAt,
      canceledAt: sql`coalesce(${sponsorships.canceledAt}, ${secondsToMs(data.canceled_at)})`,
      subscriptionEventAt: eventAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(sponsorships.stripeSubscriptionId, data.id),
        or(isNull(sponsorships.subscriptionStatus), ne(sponsorships.subscriptionStatus, 'canceled')),
        or(isNull(sponsorships.subscriptionEventAt), lte(sponsorships.subscriptionEventAt, eventAt)),
      ),
    )
}

function paymentIntentId(value: unknown): string | null {
  if (typeof value === 'string') return value.startsWith('pi_') ? value : null
  if (!value || typeof value !== 'object' || !('id' in value)) return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id.startsWith('pi_') ? id : null
}

function refundHidesPlacement(type: string, record: Record<string, unknown>): boolean {
  if (type === 'charge.refunded') {
    const amount = record.amount_refunded
    return record.refunded === true || (typeof amount === 'number' && amount > 0)
  }
  return type.startsWith('refund.') && record.status === 'succeeded'
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  if (!value || typeof value !== 'object' || !('id' in value)) return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id ? id : null
}

/**
 * The sponsor subscription a refunded payment belongs to. Subscription
 * checkouts store no payment intent (Checkout returns null for
 * mode=subscription), so the refund is traced through the invoice that the
 * payment paid: a legacy charge.invoice field, else the InvoicePayment for the
 * payment intent, then the invoice's parent subscription.
 */
async function refundSubscriptionId(stripe: Stripe, record: Record<string, unknown>, intent: string | null): Promise<string | null> {
  let invoice: unknown = record.invoice ?? null
  if (!stripeObjectId(invoice) && intent) {
    const payments = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: intent },
      limit: 1,
      expand: ['data.invoice'],
    })
    invoice = payments.data[0]?.invoice ?? null
  }
  const invoiceId = stripeObjectId(invoice)
  if (!invoiceId) return null
  const full =
    invoice && typeof invoice === 'object' && 'parent' in invoice ? invoice : await stripe.invoices.retrieve(invoiceId)
  const parsed = invoiceSchema.safeParse(full)
  return parsed.success ? invoiceSubscriptionId(parsed.data) : null
}

/** The customer on a refunded charge. A Refund only names its charge, so that is read when needed. */
async function refundCustomerId(stripe: Stripe, record: Record<string, unknown>): Promise<string | null> {
  const direct = stripeObjectId(record.customer)
  if (direct) return direct
  const chargeId = typeof record.charge === 'string' ? record.charge : null
  if (!chargeId) return null
  const charge = await stripe.charges.retrieve(chargeId)
  return stripeObjectId(charge.customer)
}

/**
 * A succeeded refund or charge.refunded stops the placement. refunded_at is set once.
 * One-time sponsorships match on the payment intent. A subscription row
 * matches on the subscription the refunded invoice belongs to. When no
 * invoice can be found, a customer with exactly one unrefunded sponsor
 * subscription and no membership is matched on the customer id; anything
 * less certain changes nothing.
 */
async function applySponsorshipRefund(db: Database, stripe: Stripe, event: Stripe.Event, now: number): Promise<void> {
  const object = event.data?.object
  if (!object || typeof object !== 'object') throw new Error('refund payload failed validation')
  const record = object as unknown as Record<string, unknown>
  if (!refundHidesPlacement(event.type, record)) return
  const intent = paymentIntentId(record.payment_intent)
  if (intent) {
    const direct = await db
      .update(sponsorships)
      .set({ refundedAt: now, updatedAt: now })
      .where(and(eq(sponsorships.stripePaymentIntentId, intent), isNull(sponsorships.refundedAt)))
      .returning({ id: sponsorships.id })
    if (direct.length > 0) return
    const known = await db
      .select({ id: sponsorships.id })
      .from(sponsorships)
      .where(eq(sponsorships.stripePaymentIntentId, intent))
      .limit(1)
    if (known.length > 0) return
  }
  const subscriptionId = await refundSubscriptionId(stripe, record, intent)
  if (subscriptionId) {
    await db
      .update(sponsorships)
      .set({ refundedAt: now, updatedAt: now })
      .where(and(eq(sponsorships.stripeSubscriptionId, subscriptionId), isNull(sponsorships.refundedAt)))
    return
  }
  const customerId = await refundCustomerId(stripe, record)
  if (!customerId) return
  const membership = await db
    .select({ id: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1)
  if (membership.length > 0) return
  const candidates = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(
      and(
        eq(sponsorships.stripeCustomerId, customerId),
        isNotNull(sponsorships.stripeSubscriptionId),
        isNull(sponsorships.refundedAt),
      ),
    )
  if (candidates.length !== 1 || !candidates[0]) return
  await db
    .update(sponsorships)
    .set({ refundedAt: now, updatedAt: now })
    .where(and(eq(sponsorships.id, candidates[0].id), isNull(sponsorships.refundedAt)))
}

async function applyEvent(db: Database, stripe: Stripe, event: Stripe.Event, now?: number): Promise<void> {
  if (isSponsorshipEvent(event)) {
    await applySponsorship(db, stripe, event, now)
    return
  }

  if (event.type === 'charge.refunded' || event.type.startsWith('refund.')) {
    await applySponsorshipRefund(db, stripe, event, now ?? Date.now())
    return
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    await applySponsorInvoice(db, event, now ?? Date.now())
    return
  }

  if (isSponsorSubscriptionEvent(event)) {
    await applySponsorSubscriptionEvent(db, event, now ?? Date.now())
    return
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const parsed = checkoutSchema.safeParse(event.data.object)
    if (!parsed.success || parsed.data.mode !== 'subscription' || !parsed.data.subscription) return
    const asyncPaid = event.type === 'checkout.session.async_payment_succeeded'
    await upsertSubscription(db, {
      subscriptionId: parsed.data.subscription,
      customerId: parsed.data.customer ?? null,
      clerkUserId: parsed.data.metadata?.clerkUserId ?? null,
      status: asyncPaid ? 'active' : 'incomplete',
      priceId: null,
      periodEnd: null,
      // A checkout event only seeds the status. customer.subscription.* is the
      // source of truth, so a row it already wrote (trialing, active, ...) is
      // not set back to incomplete when the checkout event is processed later.
      statusSource: asyncPaid ? 'checkout_paid' : 'checkout',
    })
    return
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const parsed = subscriptionSchema.safeParse(event.data.object)
    if (!parsed.success) {
      throw new Error('subscription payload failed validation')
    }
    const customer = parsed.data.customer
    const customerId = typeof customer === 'string' ? customer : customer?.id ?? null
    const item = parsed.data.items?.data?.[0]
    await upsertSubscription(db, {
      subscriptionId: parsed.data.id,
      customerId,
      clerkUserId: parsed.data.metadata?.clerkUserId ?? null,
      status: parsed.data.status,
      priceId: item?.price?.id ?? null,
      periodEnd: item?.current_period_end ?? null,
    })
    return
  }

  if (!KNOWN_EVENT_TYPES.has(event.type)) {
    console.info('stripe webhook event', event.type)
  }
}

async function upsertSubscription(
  db: Database,
  input: {
    subscriptionId: string
    customerId: string | null
    clerkUserId: string | null
    status: string
    priceId: string | null
    periodEnd: number | null
    /**
     * subscription: a customer.subscription.* event, which always wins.
     * checkout: checkout.session.completed, which only sets the status on a new row.
     * checkout_paid: async_payment_succeeded, which only moves a new or incomplete row to active.
     */
    statusSource?: 'subscription' | 'checkout' | 'checkout_paid'
  },
): Promise<void> {
  const source = input.statusSource ?? 'subscription'
  const status =
    source === 'checkout'
      ? sql`${subscriptions.status}`
      : source === 'checkout_paid'
        ? sql`CASE
            WHEN ${subscriptions.status} IS NULL OR ${subscriptions.status} IN ('', 'incomplete') THEN excluded.status
            ELSE ${subscriptions.status}
          END`
        : input.status
  const now = Date.now()
  await db
    .insert(subscriptions)
    .values({
      clerkUserId: input.clerkUserId,
      stripeCustomerId: input.customerId,
      stripeSubscriptionId: input.subscriptionId,
      stripePriceId: input.priceId,
      status: input.status,
      currentPeriodEnd: input.periodEnd,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        clerkUserId: sql`coalesce(excluded.clerk_user_id, ${subscriptions.clerkUserId})`,
        stripeCustomerId: sql`coalesce(excluded.stripe_customer_id, ${subscriptions.stripeCustomerId})`,
        stripePriceId: sql`coalesce(excluded.stripe_price_id, ${subscriptions.stripePriceId})`,
        status,
        currentPeriodEnd: sql`coalesce(excluded.current_period_end, ${subscriptions.currentPeriodEnd})`,
        updatedAt: now,
      },
    })
}
