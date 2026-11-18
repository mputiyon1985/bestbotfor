import 'server-only'

import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  paymentLinkRecoveryMailConfig,
  postResendEmail,
  type RecoverySendResult,
} from './checkout-recovery-mail'
import { recoveryEmailSuppressed } from './checkout-recovery-unsubscribe'
import type { Database } from './db'
import { paymentLinkRecoveryEmails, sponsorAbandonedCheckouts, subscribers } from './db/schema'
import { UNSUBSCRIBED_SUBSCRIBER_STATUS } from './newsletter-status'
import { RETIRED_FOUNDING_PAYMENT_LINK_ID } from './sponsor-abandoned'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { emailSchema } from './validation'

/** Footer line required on every Payment Link recovery email. */
export const PAYMENT_LINK_RECOVERY_ADDRESS = 'BestBotFor, 2525 Pointe Center Court, Suite 200, Dumfries, VA 22026'

/** Second footer line. This repo does not read inbound replies. */
export const PAYMENT_LINK_RECOVERY_OPT_OUT = "Reply 'no thanks' and we won't email you again."

/** A second recovery email to the same address waits this long. */
export const PAYMENT_LINK_RECOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Public URL of the retired founding Payment Link. It is not on
 * SPONSOR_PAYMENT_LINKS. The record is in docs/runbooks/sponsor-payment-links.md.
 */
const RETIRED_FOUNDING_PAYMENT_LINK = {
  paymentLinkId: RETIRED_FOUNDING_PAYMENT_LINK_ID,
  url: 'https://buy.stripe.com/fZudRabMce0q5BoebyfrW04',
  productName: 'Founding sponsor',
} as const

export type PaymentLinkTarget = {
  paymentLinkId: string
  url: string
  productName: string
}

export type PaymentLinkRecoverySkip =
  | 'not-payment-link'
  | 'bad-session'
  | 'paid'
  | 'no-consent'
  | 'no-email'
  | 'no-url'
  | 'mail-not-configured'
  | 'live-email-off'
  | 'suppressed'
  | 'cooldown'
  | 'duplicate'
  | 'rejected'

export type PaymentLinkRecoveryResult = { action: 'sent' } | { action: 'skipped'; reason: PaymentLinkRecoverySkip }

type ParsedPaymentLink =
  | { ok: true; sessionId: string; email: string; paymentLinkId: string }
  | { ok: false; reason: 'not-payment-link' | 'bad-session' | 'paid' | 'no-consent' | 'no-email' }

const PAYMENT_LINK_ID = /^plink_[A-Za-z0-9]+$/

function sessionRecord(event: { type?: string; data?: { object?: unknown } }): Record<string, unknown> | null {
  if (event.type !== 'checkout.session.expired') return null
  const session = event.data?.object
  if (!session || typeof session !== 'object') return null
  return session as Record<string, unknown>
}

function checkoutSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (!id.startsWith('cs_') || id.length > 255 || /\s/.test(id)) return null
  return id
}

/** Payment Link id on the session. A string or an expanded `{ id }` object. */
export function paymentLinkIdOf(value: unknown): string | null {
  if (typeof value === 'string' && PAYMENT_LINK_ID.test(value)) return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && PAYMENT_LINK_ID.test(value.id)) {
    return value.id
  }
  return null
}

function promotionsOptIn(session: Record<string, unknown>): boolean {
  const consent = session.consent
  if (!consent || typeof consent !== 'object' || !('promotions' in consent)) return false
  return consent.promotions === 'opt_in'
}

/** Only `customer_details.email`. `customer_email` and metadata are not consent to mail. */
function customerDetailsEmail(session: Record<string, unknown>): string | null {
  const details = session.customer_details
  if (!details || typeof details !== 'object' || !('email' in details)) return null
  if (typeof details.email !== 'string') return null
  const parsed = emailSchema.safeParse(details.email)
  if (!parsed.success) return null
  return parsed.data.toLowerCase()
}

function sessionPaid(session: Record<string, unknown>): boolean {
  if (session.status === 'complete') return true
  return session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
}

/**
 * Whether this expired session can get a Payment Link recovery email.
 * No Stripe read. Missing consent or a missing customer_details email is a skip.
 */
export function parseExpiredPaymentLink(event: { type?: string; data?: { object?: unknown } }): ParsedPaymentLink {
  const session = sessionRecord(event)
  if (!session) return { ok: false, reason: 'not-payment-link' }
  const paymentLinkId = paymentLinkIdOf(session.payment_link)
  if (!paymentLinkId) return { ok: false, reason: 'not-payment-link' }
  const sessionId = checkoutSessionId(session.id)
  if (!sessionId) return { ok: false, reason: 'bad-session' }
  if (sessionPaid(session)) return { ok: false, reason: 'paid' }
  if (!promotionsOptIn(session)) return { ok: false, reason: 'no-consent' }
  const email = customerDetailsEmail(session)
  if (!email) return { ok: false, reason: 'no-email' }
  return { ok: true, sessionId, email, paymentLinkId }
}

/** A public buy.stripe.com Payment Link. Anything else is not put in an email. */
export function paymentLinkUrlOk(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port !== '') return false
  if (url.hostname !== 'buy.stripe.com') return false
  return url.pathname.length > 1
}

export function cleanProductName(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return cleaned || 'a BestBotFor offer'
}

/** Known Payment Links, including the retired founding link. No Stripe call. */
export function knownPaymentLink(paymentLinkId: string): PaymentLinkTarget | null {
  const live = SPONSOR_PAYMENT_LINKS.find((link) => link.paymentLinkId === paymentLinkId)
  if (live) return { paymentLinkId, url: live.url, productName: cleanProductName(live.title) }
  if (paymentLinkId === RETIRED_FOUNDING_PAYMENT_LINK.paymentLinkId) {
    return {
      paymentLinkId,
      url: RETIRED_FOUNDING_PAYMENT_LINK.url,
      productName: RETIRED_FOUNDING_PAYMENT_LINK.productName,
    }
  }
  return null
}

type StripePaymentLinkShape = {
  url?: string | null
  line_items?: {
    data?: Array<{
      description?: string | null
      price?: { product?: string | { name?: string | null } | null } | null
    }>
  } | null
}

function productNameFromLink(link: StripePaymentLinkShape): string {
  const item = link.line_items?.data?.[0]
  const product = item?.price?.product
  const fromProduct = product && typeof product === 'object' && typeof product.name === 'string' ? product.name : ''
  const fromDescription = typeof item?.description === 'string' ? item.description : ''
  return cleanProductName(fromProduct || fromDescription)
}

async function resolvePaymentLink(stripe: Stripe, paymentLinkId: string): Promise<PaymentLinkTarget | null> {
  const known = knownPaymentLink(paymentLinkId)
  if (known) return paymentLinkUrlOk(known.url) ? known : null
  const link = (await stripe.paymentLinks.retrieve(paymentLinkId, {
    expand: ['line_items', 'line_items.data.price.product'],
  })) as unknown as StripePaymentLinkShape
  const url = typeof link.url === 'string' ? link.url : ''
  if (!paymentLinkUrlOk(url)) return null
  return { paymentLinkId, url, productName: productNameFromLink(link) }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export type PaymentLinkRecoveryMessage = {
  sessionId: string
  to: string
  subject: string
  text: string
  html: string
}

/** Short plain copy. The footer is the address line, then the reply line. */
export function paymentLinkRecoveryMessage(input: {
  sessionId: string
  email: string
  productName: string
  url: string
}): PaymentLinkRecoveryMessage | null {
  const sessionId = checkoutSessionId(input.sessionId)
  const email = emailSchema.safeParse(input.email)
  if (!sessionId || !email.success) return null
  if (!paymentLinkUrlOk(input.url)) return null
  const product = cleanProductName(input.productName)
  const subject = `Finish checkout for ${product}`.slice(0, 180)
  const text = [
    `You started checkout for ${product}. Here's the link to finish:`,
    input.url,
    '',
    PAYMENT_LINK_RECOVERY_ADDRESS,
    PAYMENT_LINK_RECOVERY_OPT_OUT,
  ].join('\n')
  const safeProduct = escapeHtml(product)
  const safeUrl = escapeHtml(input.url)
  const html = [
    `<p>You started checkout for ${safeProduct}. Here's the link to finish:</p>`,
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p>${escapeHtml(PAYMENT_LINK_RECOVERY_ADDRESS)}<br>${escapeHtml(PAYMENT_LINK_RECOVERY_OPT_OUT)}</p>`,
  ].join('')
  return { sessionId, to: email.data.toLowerCase(), subject, text, html }
}

type QueryDb = Pick<Database, 'select'>

async function blockReason(db: QueryDb, email: string, now: number): Promise<'suppressed' | 'cooldown' | null> {
  if (await recoveryEmailSuppressed(db as Database, email)) return 'suppressed'
  const subscriber = await db
    .select({ status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1)
  if (subscriber[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS) return 'suppressed'
  const cutoff = now - PAYMENT_LINK_RECOVERY_COOLDOWN_MS
  const recent = await db
    .select({ id: paymentLinkRecoveryEmails.stripeCheckoutSessionId })
    .from(paymentLinkRecoveryEmails)
    .where(and(sql`lower(${paymentLinkRecoveryEmails.email}) = ${email}`, gte(paymentLinkRecoveryEmails.createdAt, cutoff)))
    .limit(1)
  if (recent.length > 0) return 'cooldown'
  const prior = await db
    .select({ id: sponsorAbandonedCheckouts.stripeCheckoutSessionId })
    .from(sponsorAbandonedCheckouts)
    .where(
      and(
        sql`lower(${sponsorAbandonedCheckouts.email}) = ${email}`,
        gte(sponsorAbandonedCheckouts.recoveryEmailSentAt, cutoff),
      ),
    )
    .limit(1)
  if (prior.length > 0) return 'cooldown'
  return null
}

function logRecovery(sessionId: string, result: 'sent' | 'retry' | PaymentLinkRecoverySkip): void {
  console.info('payment_link_recovery_email', JSON.stringify({ session: sessionId, result }))
}

/**
 * One recovery email for an expired Payment Link Checkout.
 * The session id is inserted before the send. A second delivery hits that
 * primary key and does not send again. A retryable mail failure deletes the
 * unsent row and throws so Stripe can deliver the event again. The Resend
 * Idempotency-Key is the same session id.
 */
export async function recoverExpiredPaymentLink(
  db: Database,
  stripe: Stripe,
  event: Stripe.Event,
  now: number,
  options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch },
): Promise<PaymentLinkRecoveryResult> {
  const parsed = parseExpiredPaymentLink(event)
  if (!parsed.ok) return { action: 'skipped', reason: parsed.reason }

  const target = await resolvePaymentLink(stripe, parsed.paymentLinkId)
  if (!target) {
    logRecovery(parsed.sessionId, 'no-url')
    return { action: 'skipped', reason: 'no-url' }
  }
  const message = paymentLinkRecoveryMessage({
    sessionId: parsed.sessionId,
    email: parsed.email,
    productName: target.productName,
    url: target.url,
  })
  if (!message) {
    logRecovery(parsed.sessionId, 'no-email')
    return { action: 'skipped', reason: 'no-email' }
  }

  const env = options?.env ?? process.env
  const plan = paymentLinkRecoveryMailConfig(env, event.livemode === true)
  if (!plan.ok) {
    logRecovery(parsed.sessionId, plan.reason)
    return { action: 'skipped', reason: plan.reason }
  }

  const claim = await db.transaction(async (tx) => {
    const blocked = await blockReason(tx, parsed.email, now)
    if (blocked) return blocked
    const inserted = await tx
      .insert(paymentLinkRecoveryEmails)
      .values({
        stripeCheckoutSessionId: parsed.sessionId,
        email: parsed.email,
        paymentLinkId: target.paymentLinkId,
        productName: target.productName,
        recoveryUrl: target.url,
        createdAt: now,
        sentAt: null,
      })
      .onConflictDoNothing()
      .returning({ id: paymentLinkRecoveryEmails.stripeCheckoutSessionId })
    if (inserted.length === 0) return 'duplicate' as const
    return 'claimed' as const
  })
  if (claim !== 'claimed') {
    logRecovery(parsed.sessionId, claim)
    return { action: 'skipped', reason: claim }
  }

  let result: RecoverySendResult
  try {
    result = await postResendEmail(
      {
        idempotencyKey: parsed.sessionId,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      plan.config,
      options?.fetchImpl,
    )
  } catch {
    result = 'retry'
  }
  if (result === 'sent') {
    await db
      .update(paymentLinkRecoveryEmails)
      .set({ sentAt: now })
      .where(eq(paymentLinkRecoveryEmails.stripeCheckoutSessionId, parsed.sessionId))
    logRecovery(parsed.sessionId, 'sent')
    return { action: 'sent' }
  }
  if (result === 'retry') {
    await db
      .delete(paymentLinkRecoveryEmails)
      .where(
        and(
          eq(paymentLinkRecoveryEmails.stripeCheckoutSessionId, parsed.sessionId),
          isNull(paymentLinkRecoveryEmails.sentAt),
        ),
      )
    logRecovery(parsed.sessionId, 'retry')
    throw new Error('payment link recovery email retry')
  }
  logRecovery(parsed.sessionId, 'rejected')
  return { action: 'skipped', reason: 'rejected' }
}
