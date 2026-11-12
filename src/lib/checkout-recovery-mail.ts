import { EMAIL_SIGNATURE_HTML, EMAIL_SIGNATURE_TEXT } from './email-signature'
import { CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH, unsubscribeSecret } from './checkout-recovery-unsubscribe'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { DEFAULT_SITE_URL, getSiteUrl } from './site'
import { emailSchema } from './validation'

/**
 * Stripe does not email a recovery link. The expired-session handler sends
 * one message per Checkout Session, and only after the buyer opts in.
 * This repo has no general mail transport. The sender is Resend's HTTP API,
 * and it stays off until both mail variables are set. Live events stay off
 * unless CHECKOUT_RECOVERY_EMAIL_LIVE is exactly `true`.
 */
export const CHECKOUT_RECOVERY_RESEND_API_KEY = 'CHECKOUT_RECOVERY_RESEND_API_KEY'
export const CHECKOUT_RECOVERY_FROM = 'CHECKOUT_RECOVERY_FROM'
export const CHECKOUT_RECOVERY_EMAIL_LIVE = 'CHECKOUT_RECOVERY_EMAIL_LIVE'
export const CHECKOUT_RECOVERY_POSTAL_ADDRESS = 'CHECKOUT_RECOVERY_POSTAL_ADDRESS'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const UNSUBSCRIBE_MAILTO = 'mailto:privacy@bestbotfor.com?subject=Unsubscribe'
const UNSUBSCRIBE_INTRO =
  'You are receiving this because you opted in to promotional email during checkout.'

/**
 * Offerings whose expired session may include Stripe's 30-day recovery URL.
 * Founding and every /best placement are excluded: that URL stays payable
 * without the founding hold or the page slot. sponsor_monthly is the uncapped
 * Payment Link. A membership session is included only when it did not use the
 * founding coupon. The plan name alone does not allow the URL.
 */
export function checkoutRecoveryUrlAllowed(offering: string, foundingCoupon = false): boolean {
  if (offering === 'newsletter_slot' || offering === 'sponsor_monthly') return true
  if (offering === 'membership_monthly' || offering === 'membership_annual') return !foundingCoupon
  return false
}

/** True when the session metadata or its discounts say the founding coupon was attached. */
export function sessionFoundingCoupon(metadata: Record<string, unknown>, discounts: unknown): boolean {
  if (metadata.founding_coupon === '1') return true
  if (metadata.founding_coupon === '0') return false
  return Array.isArray(discounts) && discounts.length > 0
}

export type CheckoutRecoveryHref = {
  href: string
  /** True when href is Stripe's recovery URL, which opens a copy of the expired Checkout. */
  reopensCheckout: boolean
}

function siteOrigin(siteUrl: string | undefined): string {
  if (!siteUrl) return getSiteUrl()
  try {
    const url = new URL(siteUrl)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && local) return url.origin
  } catch {
    return DEFAULT_SITE_URL
  }
  return DEFAULT_SITE_URL
}

/** Where the email sends the buyer. A scarce offer never gets the recovery URL. */
export function checkoutRecoveryHref(input: {
  offering: string
  recoveryUrl: string | null
  foundingCoupon?: boolean
  siteUrl?: string
}): CheckoutRecoveryHref {
  const origin = siteOrigin(input.siteUrl)
  if (input.recoveryUrl && checkoutRecoveryUrlAllowed(input.offering, input.foundingCoupon === true)) {
    return { href: input.recoveryUrl, reopensCheckout: true }
  }
  if (input.offering === 'sponsor_monthly') {
    const link = SPONSOR_PAYMENT_LINKS.find((item) => item.id === 'sponsor_monthly')
    return { href: link?.url ?? `${origin}/sponsor`, reopensCheckout: false }
  }
  if (input.offering === 'membership_monthly' || input.offering === 'membership_annual') {
    return { href: `${origin}/pricing`, reopensCheckout: false }
  }
  return { href: `${origin}/sponsor`, reopensCheckout: false }
}

export type CheckoutRecoveryMessage = {
  sessionId: string
  to: string
  subject: string
  text: string
  html: string
  listUnsubscribe: string
  listUnsubscribePost: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Postal address for the footer. Blank, missing, and markup are refused. Not a hardcoded address. */
export function recoveryPostalAddress(env: Record<string, string | undefined>): string | null {
  const value = (env[CHECKOUT_RECOVERY_POSTAL_ADDRESS] ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!postalTextOk(value)) return null
  return value
}

function postalTextOk(value: string): boolean {
  if (!value || value.length > 400) return false
  return !value.includes('<') && !value.includes('>') && !value.includes('\0')
}

function unsubscribeHttps(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    return url.protocol === 'http:' && local
  } catch {
    return false
  }
}

/**
 * One promotional email. Returns null when the buyer address, postal address,
 * or unsubscribe URL is unusable. The recovery URL is included only when
 * checkoutRecoveryHref says it reopens Checkout. Every message has the postal
 * address, a one-click unsubscribe link, and privacy@bestbotfor.com.
 */
export function checkoutRecoveryMessage(input: {
  sessionId: string
  email: string
  offerLabel: string
  offering: string
  recoveryUrl: string | null
  foundingCoupon?: boolean
  postalAddress: string
  unsubscribeUrl: string
  siteUrl?: string
}): CheckoutRecoveryMessage | null {
  const email = emailSchema.safeParse(input.email)
  if (!email.success) return null
  const sessionId = input.sessionId.trim()
  if (!sessionId.startsWith('cs_') || sessionId.length > 255) return null
  const postal = input.postalAddress.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!postalTextOk(postal)) return null
  if (!unsubscribeHttps(input.unsubscribeUrl) || !input.unsubscribeUrl.includes(CHECKOUT_RECOVERY_UNSUBSCRIBE_PATH)) return null
  const link = checkoutRecoveryHref(input)
  const offer = input.offerLabel.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || 'your checkout'
  const subject = 'Your BestBotFor checkout expired'
  const action = link.reopensCheckout
    ? `This link reopens that checkout. It stops working 30 days after the checkout expired:\n${link.href}`
    : `That checkout has expired. Start again here. A new checkout checks that the offer is still open:\n${link.href}`
  const text = [
    `Your checkout for ${offer} expired before payment.`,
    '',
    action,
    '',
    UNSUBSCRIBE_INTRO,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    'Or email privacy@bestbotfor.com with the subject Unsubscribe.',
    '',
    postal,
    '',
    EMAIL_SIGNATURE_TEXT,
  ].join('\n')
  const safeOffer = escapeHtml(offer)
  const safeHref = escapeHtml(link.href)
  const safeUnsub = escapeHtml(input.unsubscribeUrl)
  const safePostal = escapeHtml(postal).replace(/\n/g, '<br>')
  const actionHtml = link.reopensCheckout
    ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111827;">This link reopens that checkout. It stops working 30 days after the checkout expired.</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;"><a href="${safeHref}" style="color:#5b4bdb;">Reopen checkout</a></p>`
    : `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111827;">That checkout has expired. Start again here. A new checkout checks that the offer is still open.</p><p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;"><a href="${safeHref}" style="color:#5b4bdb;">Start checkout again</a></p>`
  const html = [
    `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111827;">Your checkout for ${safeOffer} expired before payment.</p>`,
    actionHtml,
    `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#4b5563;">${escapeHtml(UNSUBSCRIBE_INTRO)} <a href="${safeUnsub}" style="color:#5b4bdb;">Unsubscribe</a>. Or email privacy@bestbotfor.com with the subject Unsubscribe.</p>`,
    `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#4b5563;">${safePostal}</p>`,
    EMAIL_SIGNATURE_HTML,
  ].join('')
  return {
    sessionId,
    to: email.data,
    subject,
    text,
    html,
    listUnsubscribe: `<${input.unsubscribeUrl}>, <${UNSUBSCRIBE_MAILTO}>`,
    listUnsubscribePost: 'List-Unsubscribe=One-Click',
  }
}

const FROM_ADDRESS = /^(?:[^<>\r\n]{1,80} <[^<>\r\n @]+@[^<>\r\n ]+>|[^<>\r\n @]+@[^<>\r\n ]+)$/

export type RecoveryMailSkip =
  | 'mail-not-configured'
  | 'live-email-off'
  | 'postal-address-missing'
  | 'unsubscribe-secret-missing'
  | 'suppressed'

export type RecoveryCompliance = { postalAddress: string; unsubscribeSecret: string }

/**
 * CAN-SPAM requirements that are checked before a send is claimed.
 * A blank postal address or a missing unsubscribe secret skips the send.
 */
export function recoveryCompliance(
  env: Record<string, string | undefined>,
): { ok: true; compliance: RecoveryCompliance } | { ok: false; reason: 'postal-address-missing' | 'unsubscribe-secret-missing' } {
  const postalAddress = recoveryPostalAddress(env)
  if (!postalAddress) return { ok: false, reason: 'postal-address-missing' }
  const secret = unsubscribeSecret(env)
  if (!secret) return { ok: false, reason: 'unsubscribe-secret-missing' }
  return { ok: true, compliance: { postalAddress, unsubscribeSecret: secret } }
}

export type RecoveryMailConfig = { apiKey: string; from: string }

/** Whether Resend may be called. Live mode stays off until the flag is exactly true. */
export function recoveryMailConfig(
  env: Record<string, string | undefined>,
  livemode: boolean,
): { ok: true; config: RecoveryMailConfig } | { ok: false; reason: 'mail-not-configured' | 'live-email-off' } {
  if (livemode && env[CHECKOUT_RECOVERY_EMAIL_LIVE] !== 'true') return { ok: false, reason: 'live-email-off' }
  const apiKey = env[CHECKOUT_RECOVERY_RESEND_API_KEY]?.trim() ?? ''
  const from = env[CHECKOUT_RECOVERY_FROM]?.trim() ?? ''
  if (!apiKey.startsWith('re_') || apiKey.length < 8 || /\s/.test(apiKey)) return { ok: false, reason: 'mail-not-configured' }
  if (!FROM_ADDRESS.test(from) || from.length > 200) return { ok: false, reason: 'mail-not-configured' }
  return { ok: true, config: { apiKey, from } }
}

export type RecoverySendResult = 'sent' | 'retry' | 'rejected'

/**
 * POST one email to Resend. The Idempotency-Key is the Checkout Session id,
 * so a webhook retry does not deliver a second copy. Does not log the address,
 * the body, or the API key.
 */
export async function postRecoveryEmail(
  message: CheckoutRecoveryMessage,
  config: RecoveryMailConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RecoverySendResult> {
  const idempotencyKey = `checkout-recovery-${message.sessionId}`.slice(0, 255)
  let response: Response
  try {
    response = await fetchImpl(RESEND_EMAILS_URL, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(6_000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          'List-Unsubscribe': message.listUnsubscribe,
          'List-Unsubscribe-Post': message.listUnsubscribePost,
        },
      }),
    })
  } catch {
    return 'retry'
  }
  if (response.ok) return 'sent'
  if (response.status === 429 || response.status >= 500) return 'retry'
  return 'rejected'
}
