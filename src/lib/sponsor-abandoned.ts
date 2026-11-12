import 'server-only'

import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  checkoutRecoveryMessage,
  checkoutRecoveryUrlAllowed,
  postRecoveryEmail,
  recoveryCompliance,
  recoveryMailConfig,
  sessionFoundingCoupon,
  type CheckoutRecoveryMessage,
  type RecoveryMailSkip,
  type RecoverySendResult,
} from './checkout-recovery-mail'
import {
  CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH,
  checkoutRecoveryUnsubscribeToken,
  recoveryEmailSuppressed,
} from './checkout-recovery-unsubscribe'
import { getSiteUrl } from './site'
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

export type AbandonedSponsorLead = {
  sessionId: string
  email: string
  offering: string
  expiredAt: number
  taskSlug: string | null
  source: 'checkout' | 'payment_link'
  recoveryUrl: string | null
  /** Buyer's choice on the expired session. Only opt_in is stored. */
  promotionsConsent: 'opt_in'
  /** When we observed the opt-in. Stripe does not send a separate consent clock; this is the expiry event time. */
  consentedAt: number
}

export function abandonedOfferLabel(offering: string): string {
  if (offering === 'sponsor_monthly') return 'Sponsor Monthly'
  if (offering === 'membership_monthly') return 'Membership, monthly'
  if (offering === 'membership_annual') return 'Membership, annual'
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

/**
 * The buyer's answer is `consent.promotions` (`opt_in` or `opt_out`).
 * `consent_collection.promotions` is only the setting (`auto` or `none`) and
 * is not consent. A missing answer stores nothing.
 */
export function promotionsOptIn(session: Record<string, unknown>): boolean {
  const consent = session.consent
  if (!consent || typeof consent !== 'object' || !('promotions' in consent)) return false
  return consent.promotions === 'opt_in'
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

function membershipOffering(metadata: Record<string, unknown>): 'membership_monthly' | 'membership_annual' | null {
  const userId = metadata.clerkUserId
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 200) return null
  if (metadata.plan === 'monthly') return 'membership_monthly'
  if (metadata.plan === 'annual') return 'membership_annual'
  return null
}

/**
 * Lead from checkout.session.expired, or null when we will not store it.
 * No Stripe read. A row is stored only when the buyer opted in
 * (`consent.promotions` is `opt_in`) and the session is an unpaid sponsor
 * checkout, a known Payment Link, or a membership checkout. A recovery URL
 * is kept only for offerings that may reopen Checkout.
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

  if (!promotionsOptIn(record)) return null
  const metadata = metadataRecord(record)
  const linkId = paymentLinkId(record.payment_link)
  const linkOffer = linkId ? PAYMENT_LINK_OFFER[linkId] : null
  const metaOffer = typeof metadata.offer === 'string' ? metadata.offer : ''
  const inApp = metadata.kind === 'sponsorship' && typeof metadata.offering === 'string' && sponsorOffering(metadata.offering) !== null
  // Metadata alone is not enough. The Payment Link id has to be one we know,
  // and its offer has to agree when metadata names one.
  const paymentLink = !inApp && linkOffer != null && (metaOffer === '' || metaOffer === linkOffer)
  const membership = !inApp && !paymentLink ? membershipOffering(metadata) : null

  if (!inApp && !paymentLink && !membership) return null
  const email = leadEmail(record, metadata)
  if (!email) return null

  const offering = inApp && typeof metadata.offering === 'string' ? metadata.offering : membership ?? (linkOffer || metaOffer)
  if (!offering) return null
  const created = event.created
  const expiredAt = typeof created === 'number' && Number.isFinite(created) && created > 0 ? Math.trunc(created * 1000) : now
  if (!Number.isFinite(expiredAt) || expiredAt <= 0) return null
  const recovery = record.after_expiration
  const rawRecoveryUrl =
    recovery && typeof recovery === 'object' && 'recovery' in recovery
      ? sponsorRecoveryUrl((recovery.recovery as { url?: unknown } | null)?.url)
      : null
  // Drop a URL that would reopen a scarce Checkout. Founding and placements
  // do not turn recovery on; this also ignores one if a session somehow has it.
  const recoveryUrl = checkoutRecoveryUrlAllowed(offering, sessionFoundingCoupon(metadata, record.discounts))
    ? rawRecoveryUrl
    : null

  return {
    sessionId: id,
    email,
    offering,
    expiredAt,
    taskSlug: taskSlugFrom(metadata, record),
    source: paymentLink ? 'payment_link' : 'checkout',
    recoveryUrl,
    promotionsConsent: 'opt_in',
    consentedAt: expiredAt,
  }
}

/** How long a crashed send keeps the lease before another delivery may try again. */
export const RECOVERY_EMAIL_CLAIM_LEASE_MS = 60_000

export type RecoveryMailer = (message: CheckoutRecoveryMessage) => Promise<RecoverySendResult>

function logRecoveryEmail(sessionId: string, result: RecoverySendResult | RecoveryMailSkip): void {
  console.info('checkout_recovery_email', JSON.stringify({ session: sessionId, result }))
}

/**
 * Insert the lead once. A second delivery of the same session fills a missing
 * recovery URL or task and leaves the rest. One recovery email per session,
 * and only for opt_in. Pass mailer in tests. Omit it to use the Resend env
 * config. Pass null to record the lead and send nothing.
 */
export async function recordExpiredSponsorCheckout(
  db: Database,
  event: Stripe.Event,
  now: number,
  mailer?: RecoveryMailer | null,
): Promise<void> {
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
      promotionsConsent: lead.promotionsConsent,
      consentedAt: lead.consentedAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: sponsorAbandonedCheckouts.stripeCheckoutSessionId,
      set: {
        recoveryUrl: sql`coalesce(${sponsorAbandonedCheckouts.recoveryUrl}, excluded.recovery_url)`,
        taskSlug: sql`coalesce(${sponsorAbandonedCheckouts.taskSlug}, excluded.task_slug)`,
      },
    })

  const compliance = recoveryCompliance(process.env)
  if (!compliance.ok) {
    logRecoveryEmail(lead.sessionId, compliance.reason)
    return
  }
  if (await recoveryEmailSuppressed(db, lead.email)) {
    logRecoveryEmail(lead.sessionId, 'suppressed')
    return
  }
  const token = checkoutRecoveryUnsubscribeToken(compliance.compliance.unsubscribeSecret, lead.email)
  const unsubscribeUrl = token
    ? `${getSiteUrl()}${CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`
    : ''
  const message = checkoutRecoveryMessage({
    sessionId: lead.sessionId,
    email: lead.email,
    offerLabel: abandonedOfferLabel(lead.offering),
    offering: lead.offering,
    recoveryUrl: lead.recoveryUrl,
    postalAddress: compliance.compliance.postalAddress,
    unsubscribeUrl,
  })
  if (!message) return

  let send = mailer
  if (send === undefined) {
    const plan = recoveryMailConfig(process.env, event.livemode === true)
    if (!plan.ok) {
      logRecoveryEmail(lead.sessionId, plan.reason)
      return
    }
    send = (item) => postRecoveryEmail(item, plan.config)
  }
  if (!send) return

  const claimed = await db
    .update(sponsorAbandonedCheckouts)
    .set({ recoveryEmailClaimedAt: now })
    .where(
      and(
        eq(sponsorAbandonedCheckouts.stripeCheckoutSessionId, lead.sessionId),
        isNull(sponsorAbandonedCheckouts.recoveryEmailSentAt),
        eq(sponsorAbandonedCheckouts.promotionsConsent, 'opt_in'),
        or(
          isNull(sponsorAbandonedCheckouts.recoveryEmailClaimedAt),
          lt(sponsorAbandonedCheckouts.recoveryEmailClaimedAt, now - RECOVERY_EMAIL_CLAIM_LEASE_MS),
        ),
      ),
    )
    .returning({ id: sponsorAbandonedCheckouts.stripeCheckoutSessionId })
  if (claimed.length === 0) return

  let result: RecoverySendResult
  try {
    result = await send(message)
  } catch {
    result = 'retry'
  }
  if (result === 'sent') {
    await db
      .update(sponsorAbandonedCheckouts)
      .set({ recoveryEmailSentAt: now })
      .where(eq(sponsorAbandonedCheckouts.stripeCheckoutSessionId, lead.sessionId))
    logRecoveryEmail(lead.sessionId, 'sent')
    return
  }
  await db
    .update(sponsorAbandonedCheckouts)
    .set({ recoveryEmailClaimedAt: null })
    .where(
      and(
        eq(sponsorAbandonedCheckouts.stripeCheckoutSessionId, lead.sessionId),
        eq(sponsorAbandonedCheckouts.recoveryEmailClaimedAt, now),
        isNull(sponsorAbandonedCheckouts.recoveryEmailSentAt),
      ),
    )
  logRecoveryEmail(lead.sessionId, result)
  // A reject is a 4xx from the mail API. The lease is cleared and sent_at stays
  // null, so the row still shows as unsent. A retry is a 429, a 5xx, or a
  // network error: throw so Stripe delivers the event again.
  if (result === 'retry') throw new Error('checkout recovery email retry')
}

export async function listAbandonedSponsorCheckouts(db: Database, limit = 50) {
  return db
    .select()
    .from(sponsorAbandonedCheckouts)
    .orderBy(desc(sponsorAbandonedCheckouts.expiredAt))
    .limit(limit)
}
