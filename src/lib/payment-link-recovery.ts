import 'server-only'

import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type Stripe from 'stripe'
import {
  CHECKOUT_RECOVERY_EMAIL_LIVE,
  CHECKOUT_RECOVERY_PAYMENT_LINK_IDS,
  paymentLinkRecoveryMailConfig,
  postRecoveryEmail,
  recoveryCompliance,
  type CheckoutRecoveryMessage,
} from './checkout-recovery-mail'
import {
  claimRecoveryAddress,
  markRecoveryAddressFailed,
  markRecoveryAddressSent,
  releaseRecoveryAddressClaim,
} from './checkout-recovery-claim'
import {
  CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH,
  checkoutRecoveryUnsubscribeToken,
  recoveryEmailSuppressed,
} from './checkout-recovery-unsubscribe'
import type { Database } from './db'
import { paymentLinkRecoveryEmails, subscribers } from './db/schema'
import { UNSUBSCRIBED_SUBSCRIBER_STATUS } from './newsletter-status'
import { RECOVERY_EMAIL_CLAIM_LEASE_MS, parseExpiredSponsorCheckout } from './sponsor-abandoned'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { getSiteUrl } from './site'
import { emailSchema } from './validation'

/** Second footer line, after the postal address from CHECKOUT_RECOVERY_POSTAL_ADDRESS. */
export const PAYMENT_LINK_RECOVERY_OPT_OUT = "Reply 'no thanks' and we won't email you again."

export { CHECKOUT_RECOVERY_PAYMENT_LINK_IDS } from './checkout-recovery-mail'

const PAYMENT_LINK_ID = /^plink_[A-Za-z0-9]+$/
const UNSUBSCRIBE_MAILTO = 'mailto:privacy@bestbotfor.com?subject=Unsubscribe'

export type PaymentLinkRecoverySkip =
  | 'not-payment-link'
  | 'bad-session'
  | 'paid'
  | 'no-consent'
  | 'no-email'
  | 'not-allowlisted'
  | 'sponsor-checkout'
  | 'no-url'
  | 'inactive'
  | 'mail-not-configured'
  | 'live-email-off'
  | 'postal-address-missing'
  | 'unsubscribe-secret-missing'
  | 'suppressed'
  | 'cooldown'
  | 'duplicate'
  | 'rejected'

export type PaymentLinkRecoveryResult = { action: 'sent' } | { action: 'skipped'; reason: PaymentLinkRecoverySkip }

type ParsedPaymentLink =
  | { ok: true; sessionId: string; email: string; paymentLinkId: string }
  | { ok: false; reason: 'not-payment-link' | 'bad-session' | 'paid' | 'no-consent' | 'no-email' }

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

/**
 * Comma-separated plink ids from CHECKOUT_RECOVERY_PAYMENT_LINK_IDS.
 * There is no default. Unset, blank, and ids that are not plink_… are ignored.
 */
export function checkoutRecoveryPaymentLinkIds(env: Record<string, string | undefined>): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const part of (env[CHECKOUT_RECOVERY_PAYMENT_LINK_IDS] ?? '').split(',')) {
    const id = part.trim()
    if (PAYMENT_LINK_ID.test(id)) ids.add(id)
  }
  return ids
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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type StripePaymentLinkShape = {
  active?: boolean
  url?: string | null
  line_items?: {
    data?: Array<{
      description?: string | null
      price?: { product?: string | { name?: string | null } | null } | null
    }>
  } | null
}

function productNameFromLink(link: StripePaymentLinkShape, paymentLinkId: string): string {
  const item = link.line_items?.data?.[0]
  const product = item?.price?.product
  const fromProduct = product && typeof product === 'object' && typeof product.name === 'string' ? product.name : ''
  const fromDescription = typeof item?.description === 'string' ? item.description : ''
  const known = SPONSOR_PAYMENT_LINKS.find((entry) => entry.paymentLinkId === paymentLinkId)?.title ?? ''
  return cleanProductName(fromProduct || fromDescription || known)
}

/**
 * Active Payment Link only. An inactive link, or a url that is not
 * https://buy.stripe.com/…, is not emailed.
 */
async function activePaymentLink(
  stripe: Stripe,
  paymentLinkId: string,
): Promise<{ url: string; productName: string } | null> {
  const link = (await stripe.paymentLinks.retrieve(paymentLinkId, {
    expand: ['line_items', 'line_items.data.price.product'],
  })) as unknown as StripePaymentLinkShape
  if (link.active !== true) return null
  const url = typeof link.url === 'string' ? link.url : ''
  if (!paymentLinkUrlOk(url)) return null
  return { url, productName: productNameFromLink(link, paymentLinkId) }
}

/** Short copy plus the same unsubscribe line the in-app recovery email uses. */
export function paymentLinkRecoveryMessage(input: {
  sessionId: string
  email: string
  productName: string
  url: string
  postalAddress: string
  unsubscribeUrl: string
}): CheckoutRecoveryMessage | null {
  const sessionId = checkoutSessionId(input.sessionId)
  const email = emailSchema.safeParse(input.email)
  if (!sessionId || !email.success) return null
  if (!paymentLinkUrlOk(input.url)) return null
  if (!input.unsubscribeUrl.includes(CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH)) return null
  const postal = input.postalAddress.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!postal || postal.includes('<') || postal.includes('>')) return null
  const product = cleanProductName(input.productName)
  const subject = `Finish checkout for ${product}`.slice(0, 180)
  const text = [
    `You started checkout for ${product}. Here's the link to finish:`,
    input.url,
    '',
    `Unsubscribe: ${input.unsubscribeUrl}`,
    'Or email privacy@bestbotfor.com with the subject Unsubscribe.',
    '',
    postal,
    PAYMENT_LINK_RECOVERY_OPT_OUT,
  ].join('\n')
  const safeProduct = escapeHtml(product)
  const safeUrl = escapeHtml(input.url)
  const safeUnsub = escapeHtml(input.unsubscribeUrl)
  const safePostal = escapeHtml(postal).replace(/\n/g, '<br>')
  const html = [
    `<p>You started checkout for ${safeProduct}. Here's the link to finish:</p>`,
    `<p><a href="${safeUrl}">${safeUrl}</a></p>`,
    `<p><a href="${safeUnsub}">Unsubscribe</a>. Or email privacy@bestbotfor.com with the subject Unsubscribe.</p>`,
    `<p>${safePostal}<br>${escapeHtml(PAYMENT_LINK_RECOVERY_OPT_OUT)}</p>`,
  ].join('')
  return {
    sessionId,
    to: email.data.toLowerCase(),
    subject,
    text,
    html,
    listUnsubscribe: `<${input.unsubscribeUrl}>, <${UNSUBSCRIBE_MAILTO}>`,
    listUnsubscribePost: 'List-Unsubscribe=One-Click',
  }
}

function logRecovery(sessionId: string, result: 'sent' | 'retry' | PaymentLinkRecoverySkip): void {
  console.info('payment_link_recovery_email', JSON.stringify({ session: sessionId, result }))
}

async function addressSuppressed(db: Database, email: string): Promise<boolean> {
  if (await recoveryEmailSuppressed(db, email)) return true
  const subscriber = await db
    .select({ status: subscribers.status })
    .from(subscribers)
    .where(eq(subscribers.email, email))
    .limit(1)
  return subscriber[0]?.status === UNSUBSCRIBED_SUBSCRIBER_STATUS
}

/**
 * One recovery email for an expired Payment Link that is on the env allowlist
 * and is not already handled by the in-app sponsor email.
 * Live mode and the allowlist are checked before any Stripe read. The live
 * flag off means this returns without calling Stripe.
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

  const env = options?.env ?? process.env
  if (event.livemode === true && env[CHECKOUT_RECOVERY_EMAIL_LIVE] !== 'true') {
    logRecovery(parsed.sessionId, 'live-email-off')
    return { action: 'skipped', reason: 'live-email-off' }
  }
  if (!checkoutRecoveryPaymentLinkIds(env).has(parsed.paymentLinkId)) {
    logRecovery(parsed.sessionId, 'not-allowlisted')
    return { action: 'skipped', reason: 'not-allowlisted' }
  }
  // Monthly and the retired founding link already get the in-app email.
  if (parseExpiredSponsorCheckout(event, now)) {
    logRecovery(parsed.sessionId, 'sponsor-checkout')
    return { action: 'skipped', reason: 'sponsor-checkout' }
  }
  const compliance = recoveryCompliance(env)
  if (!compliance.ok) {
    logRecovery(parsed.sessionId, compliance.reason)
    return { action: 'skipped', reason: compliance.reason }
  }
  const plan = paymentLinkRecoveryMailConfig(env, event.livemode === true)
  if (!plan.ok) {
    logRecovery(parsed.sessionId, plan.reason)
    return { action: 'skipped', reason: plan.reason }
  }
  if (await addressSuppressed(db, parsed.email)) {
    logRecovery(parsed.sessionId, 'suppressed')
    return { action: 'skipped', reason: 'suppressed' }
  }

  const target = await activePaymentLink(stripe, parsed.paymentLinkId)
  if (!target) {
    logRecovery(parsed.sessionId, 'inactive')
    return { action: 'skipped', reason: 'inactive' }
  }
  const token = checkoutRecoveryUnsubscribeToken(compliance.compliance.unsubscribeSecret, parsed.email)
  const unsubscribeUrl = token
    ? `${getSiteUrl()}${CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}`
    : ''
  const message = paymentLinkRecoveryMessage({
    sessionId: parsed.sessionId,
    email: parsed.email,
    productName: target.productName,
    url: target.url,
    postalAddress: compliance.compliance.postalAddress,
    unsubscribeUrl,
  })
  if (!message) {
    logRecovery(parsed.sessionId, 'no-email')
    return { action: 'skipped', reason: 'no-email' }
  }

  const address = await claimRecoveryAddress(db, parsed.email, parsed.sessionId, now)
  if (address !== 'claimed') {
    logRecovery(parsed.sessionId, address)
    return { action: 'skipped', reason: address }
  }
  const inserted = await db
    .insert(paymentLinkRecoveryEmails)
    .values({
      stripeCheckoutSessionId: parsed.sessionId,
      email: parsed.email,
      paymentLinkId: parsed.paymentLinkId,
      productName: target.productName,
      recoveryUrl: target.url,
      createdAt: now,
      sentAt: null,
      sendStatus: 'claimed',
    })
    .onConflictDoUpdate({
      target: paymentLinkRecoveryEmails.stripeCheckoutSessionId,
      set: {
        email: parsed.email,
        paymentLinkId: parsed.paymentLinkId,
        productName: target.productName,
        recoveryUrl: target.url,
        createdAt: now,
        sentAt: null,
        sendStatus: 'claimed',
      },
      setWhere: or(
        eq(paymentLinkRecoveryEmails.sendStatus, 'failed'),
        and(
          eq(paymentLinkRecoveryEmails.sendStatus, 'claimed'),
          lt(paymentLinkRecoveryEmails.createdAt, now - RECOVERY_EMAIL_CLAIM_LEASE_MS),
        ),
      ),
    })
    .returning({ id: paymentLinkRecoveryEmails.stripeCheckoutSessionId })
  if (inserted.length === 0) {
    await releaseRecoveryAddressClaim(db, parsed.email, parsed.sessionId)
    logRecovery(parsed.sessionId, 'duplicate')
    return { action: 'skipped', reason: 'duplicate' }
  }
  let result: 'sent' | 'retry' | 'rejected'
  try {
    result = await postRecoveryEmail(message, plan.config, options?.fetchImpl)
  } catch {
    result = 'retry'
  }
  if (result === 'sent') {
    await db
      .update(paymentLinkRecoveryEmails)
      .set({ sentAt: now, sendStatus: 'sent' })
      .where(eq(paymentLinkRecoveryEmails.stripeCheckoutSessionId, parsed.sessionId))
    await markRecoveryAddressSent(db, parsed.email, parsed.sessionId, now)
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
    await releaseRecoveryAddressClaim(db, parsed.email, parsed.sessionId)
    logRecovery(parsed.sessionId, 'retry')
    throw new Error('payment link recovery email retry')
  }
  await db
    .update(paymentLinkRecoveryEmails)
    .set({ sentAt: null, sendStatus: 'failed' })
    .where(eq(paymentLinkRecoveryEmails.stripeCheckoutSessionId, parsed.sessionId))
  await markRecoveryAddressFailed(db, parsed.email, parsed.sessionId)
  logRecovery(parsed.sessionId, 'rejected')
  return { action: 'skipped', reason: 'rejected' }
}
