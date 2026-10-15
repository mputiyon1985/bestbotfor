import { eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { z } from 'zod'
import type { Database } from './db'
import { stripeEvents, subscriptions } from './db/schema'
import { getDb } from './db'
import { isDeadline, withDeadline } from './deadline'
import { getStripe, stripeWebhookSecret } from './stripe'

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
 * The event id is inserted first. A retry sees the conflict and returns 200
 * without applying the change again. If applying fails, the event row is
 * removed so Stripe can retry safely.
 */
export async function handleStripeWebhook(input: {
  rawBody: string
  signature: string | null
  db?: Database
  stripe?: Stripe | null
  secret?: string | null
  deadlineMs?: number
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

  if (event.livemode) {
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
    .values({ id: event.id, type: event.type, processedAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id })

  if (inserted.length === 0) return 'duplicate'

  try {
    await applyEvent(db, event)
  } catch (error) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id))
    throw error
  }
  return 'ok'
}

async function applyEvent(db: Database, event: Stripe.Event): Promise<void> {
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
