import { eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { z } from 'zod'
import type { Database } from './db'
import { sponsorships, stripeEvents, subscriptions } from './db/schema'
import { getDb } from './db'
import { isDeadline, withDeadline } from './deadline'
import { sponsorOffering } from './sponsor-offerings'
import { getStripe, stripeWebhookSecret } from './stripe'
import { liveModeAllowed } from './stripe-key'

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
 * If applying fails, the event row is removed so Stripe can retry safely.
 */
export async function handleStripeWebhook(input: {
  rawBody: string
  signature: string | null
  db?: Database
  stripe?: Stripe | null
  secret?: string | null
  deadlineMs?: number
  allowLive?: boolean
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
    const outcome = await withDeadline(applyWebhook(db, event), deadlineMs)
    if (outcome === 'duplicate') return { status: 200, body: { received: true, duplicate: true } }
    return { status: 200, body: { received: true } }
  } catch (error) {
    if (isDeadline(error)) {
      try {
        await withDeadline(db.delete(stripeEvents).where(eq(stripeEvents.id, event.id)), Math.min(deadlineMs, 300))
      } catch (cleanup) {
        console.error('stripe webhook cleanup failed', cleanup instanceof Error ? cleanup.name : 'error')
      }
      return { status: 500, body: { error: 'webhook-timeout' } }
    }
    console.error('stripe webhook apply failed', event.type)
    throw error
  }
}

async function applyWebhook(db: Database, event: Stripe.Event): Promise<'ok' | 'duplicate'> {
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
    await applyEvent(db, event)
    await db.update(stripeEvents).set({ processedAt: Date.now() }).where(eq(stripeEvents.id, event.id))
  } catch (error) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id))
    throw error
  }
  return 'ok'
}

const KNOWN_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

const sponsorshipCheckoutSchema = z.object({
  id: z.string().min(1).max(255),
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

async function applySponsorship(db: Database, event: Stripe.Event): Promise<void> {
  const parsed = sponsorshipCheckoutSchema.safeParse(event.data.object)
  if (!parsed.success || parsed.data.metadata?.kind !== 'sponsorship') {
    throw new Error('sponsorship payload failed validation')
  }
  const offering = sponsorOffering(parsed.data.metadata.offering)
  if (!offering) throw new Error('sponsorship payload failed validation')
  const priceId = parsed.data.metadata.price_id
  const now = Date.now()
  const status = sponsorshipStatus(event.type, parsed.data.payment_status)
  await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: parsed.data.id,
      stripePaymentIntentId: stripeId(parsed.data.payment_intent),
      stripeCustomerId: stripeId(parsed.data.customer),
      stripePriceId: priceId && priceId.startsWith('price_') ? priceId : null,
      offering: offering.id,
      status,
      email: parsed.data.customer_email ?? parsed.data.metadata.email ?? null,
      company: parsed.data.metadata.company || null,
      taskSlug: parsed.data.metadata.task_slug || null,
      issueDate: parsed.data.metadata.issue_date || null,
      amountTotal: parsed.data.amount_total ?? null,
      currency: parsed.data.currency ?? null,
      createdAt: now,
      updatedAt: now,
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
        updatedAt: now,
      },
    })
}

async function applyEvent(db: Database, event: Stripe.Event): Promise<void> {
  if (isSponsorshipEvent(event)) {
    await applySponsorship(db, event)
    return
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const parsed = checkoutSchema.safeParse(event.data.object)
    if (!parsed.success || parsed.data.mode !== 'subscription' || !parsed.data.subscription) return
    await upsertSubscription(db, {
      subscriptionId: parsed.data.subscription,
      customerId: parsed.data.customer ?? null,
      clerkUserId: parsed.data.metadata?.clerkUserId ?? null,
      status: event.type === 'checkout.session.async_payment_succeeded' ? 'active' : 'incomplete',
      priceId: null,
      periodEnd: null,
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
  },
): Promise<void> {
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
        status: input.status,
        currentPeriodEnd: sql`coalesce(excluded.current_period_end, ${subscriptions.currentPeriodEnd})`,
        updatedAt: now,
      },
    })
}
