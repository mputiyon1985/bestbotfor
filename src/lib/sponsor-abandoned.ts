import 'server-only'

import { desc, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import type { Database } from './db'
import { sponsorAbandonedCheckouts } from './db/schema'
import { isStripeHostedUrl } from './redirect'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { sponsorOffering } from './sponsor-offerings'
import { emailSchema, slugSchema } from './validation'

/**
 * The founding Payment Link is retired and is not shown on /sponsor. An
 * expired session from it is still a sponsor lead if one arrives.
 */
export const RETIRED_FOUNDING_PAYMENT_LINK_ID = 'plink_1URylTIJUbygfAuc07cebXfn'

const MONTHLY_PAYMENT_LINK_ID = SPONSOR_PAYMENT_LINKS.find((link) => link.id === 'sponsor_monthly')?.paymentLinkId
if (!MONTHLY_PAYMENT_LINK_ID) throw new Error('monthly sponsor payment link is missing')

/** Payment Link id to the offer stored on an expired session. Monthly is the live link. */
const PAYMENT_LINK_OFFER: Readonly<Record<string, string>> = {
  [RETIRED_FOUNDING_PAYMENT_LINK_ID]: 'founding_sponsor',
  [MONTHLY_PAYMENT_LINK_ID]: 'sponsor_monthly',
}

const PAYMENT_LINK_OFFERS = new Set(['founding_sponsor', 'sponsor_monthly'])

export type AbandonedSponsorLead = {
  sessionId: string
  email: string
  offering: string
  expiredAt: number
  taskSlug: string | null
  source: 'checkout' | 'payment_link'
  recoveryUrl: string | null
}

export function abandonedOfferLabel(offering: string): string {
  if (offering === 'sponsor_monthly') return 'Sponsor Monthly'
  return sponsorOffering(offering)?.title ?? offering
}

/**
 * A recovery URL Stripe attaches after expiry. Payment Link sessions do not
 * get one. buy.stripe.com/r/… is the shape in Stripe's abandoned-cart example;
 * hosted Checkout and Billing URLs are accepted too.
 */
export function sponsorRecoveryUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return null
  if (url.hostname === 'buy.stripe.com') {
    if (!url.pathname.startsWith('/r/')) return null
    return url.toString()
  }
  if (!isStripeHostedUrl(value)) return null
  return url.toString()
}

function sessionId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 4 || value.length > 255) return null
  if (!value.startsWith('cs_')) return null
  return value
}

function leadEmail(session: Record<string, unknown>, metadata: Record<string, unknown>): string | null {
  const details = session.customer_details
  const detailEmail = details && typeof details === 'object' && 'email' in details ? details.email : null
  const candidates = [detailEmail, session.customer_email, metadata.email]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const parsed = emailSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }
  return null
}

function paymentLinkId(value: unknown): string | null {
  if (typeof value === 'string') return PAYMENT_LINK_OFFER[value] ? value : null
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && PAYMENT_LINK_OFFER[value.id]) {
    return value.id
  }
  return null
}

function taskSlugFrom(metadata: Record<string, unknown>, session: Record<string, unknown>): string | null {
  const direct = typeof metadata.task_slug === 'string' ? metadata.task_slug : ''
  if (slugSchema.safeParse(direct).success) return direct
  const fields = session.custom_fields
  if (!Array.isArray(fields)) return null
  for (const field of fields) {
    if (!field || typeof field !== 'object' || field.key !== 'best_page') continue
    const text = 'text' in field && field.text && typeof field.text === 'object' ? field.text.value : null
    if (typeof text !== 'string') continue
    const slug = text.trim().toLowerCase()
    if (slugSchema.safeParse(slug).success) return slug
  }
  return null
}

function metadataRecord(session: Record<string, unknown>): Record<string, unknown> {
  const metadata = session.metadata
  if (!metadata || typeof metadata !== 'object') return {}
  return metadata as Record<string, unknown>
}

/**
 * Lead from checkout.session.expired, or null when the session is not an
 * unpaid sponsor checkout we can contact. No Stripe read. No email is sent.
 * Stripe omits customer_details.email unless the buyer opted into promotions.
 * In-app sessions also copy the email the buyer typed on /sponsor into metadata.
 */
export function parseExpiredSponsorCheckout(event: { type?: string; created?: number; data?: { object?: unknown } }, now: number): AbandonedSponsorLead | null {
  if (event.type !== 'checkout.session.expired') return null
  const session = event.data?.object
  if (!session || typeof session !== 'object') return null
  const record = session as Record<string, unknown>
  const id = sessionId(record.id)
  if (!id) return null
  if (record.status === 'complete') return null
  if (record.payment_status === 'paid' || record.payment_status === 'no_payment_required') return null

  const metadata = metadataRecord(record)
  const linkId = paymentLinkId(record.payment_link)
  const linkOffer = linkId ? PAYMENT_LINK_OFFER[linkId] : null
  const metaOffer = typeof metadata.offer === 'string' ? metadata.offer : ''
  const inApp = metadata.kind === 'sponsorship' && typeof metadata.offering === 'string' && sponsorOffering(metadata.offering) !== null
  const paymentLink =
    !inApp &&
    ((linkOffer != null && (metaOffer === '' || metaOffer === linkOffer)) ||
      (metadata.source === 'payment_link' && PAYMENT_LINK_OFFERS.has(metaOffer) && (linkOffer == null || linkOffer === metaOffer)))

  if (!inApp && !paymentLink) return null
  const email = leadEmail(record, metadata)
  if (!email) return null

  const offering = inApp && typeof metadata.offering === 'string' ? metadata.offering : linkOffer || metaOffer
  if (!offering) return null
  const created = event.created
  const expiredAt = typeof created === 'number' && Number.isFinite(created) && created > 0 ? Math.trunc(created * 1000) : now
  const recovery = record.after_expiration
  const recoveryUrl =
    recovery && typeof recovery === 'object' && 'recovery' in recovery
      ? sponsorRecoveryUrl((recovery.recovery as { url?: unknown } | null)?.url)
      : null

  return {
    sessionId: id,
    email,
    offering,
    expiredAt,
    taskSlug: taskSlugFrom(metadata, record),
    source: inApp ? 'checkout' : 'payment_link',
    recoveryUrl,
  }
}

/** Insert the lead once. A second delivery of the same session fills a missing recovery URL or task and leaves the rest. */
export async function recordExpiredSponsorCheckout(db: Database, event: Stripe.Event, now: number): Promise<void> {
  const lead = parseExpiredSponsorCheckout(event, now)
  if (!lead) return
  await db
    .insert(sponsorAbandonedCheckouts)
    .values({
      stripeCheckoutSessionId: lead.sessionId,
      email: lead.email,
      offering: lead.offering,
      expiredAt: lead.expiredAt,
      taskSlug: lead.taskSlug,
      source: lead.source,
      recoveryUrl: lead.recoveryUrl,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: sponsorAbandonedCheckouts.stripeCheckoutSessionId,
      set: {
        recoveryUrl: sql`coalesce(${sponsorAbandonedCheckouts.recoveryUrl}, excluded.recovery_url)`,
        taskSlug: sql`coalesce(${sponsorAbandonedCheckouts.taskSlug}, excluded.task_slug)`,
      },
    })
}

export async function listAbandonedSponsorCheckouts(db: Database, limit = 50) {
  return db
    .select()
    .from(sponsorAbandonedCheckouts)
    .orderBy(desc(sponsorAbandonedCheckouts.expiredAt))
    .limit(limit)
}
