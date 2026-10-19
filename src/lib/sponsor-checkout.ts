import 'server-only'

import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { taskSeeds } from '@/data/catalog'
import {
  SPONSOR_BUSINESS_NAME,
  SPONSOR_INTEGRATION_IDENTIFIER,
  sponsorOffering,
  sponsorOfferingNotice,
  sponsorPriceId,
  sponsorPriceLockMonths,
  sponsorSetupPriceId,
  sponsorTrialDays,
  type SponsorOfferingId,
} from './sponsor-offerings'
import type { RateLimitDecision } from './action-limit'
import { sanitizeSponsorCompany } from './sponsor-company'
import { foundingCheckoutExpiresAt } from './sponsor-hold-window'
import { emailSchema } from './validation'

const COMPANY = /^[^\r\n<>]{2,120}$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TASKS = new Set(taskSeeds.map((task) => task.slug))

/** Copy shown when sponsor checkout is denied. `limit` and `unavailable` each have their own sentence. */
export function sponsorRateLimitMessage(decision: Exclude<RateLimitDecision, 'allow'>): string {
  if (decision === 'unavailable') return 'Checkout is temporarily unavailable. Try again.'
  return 'Too many checkout attempts. Try again in an hour.'
}

export type SponsorCheckoutInput = {
  offering: SponsorOfferingId
  email: string
  company: string
  taskSlug: string | null
  issueDate: string | null
  priceId: string
  /** One-time Price billed on the first invoice of a subscription (founding $99). */
  setupPriceId?: string | null
  requestId: string
  /** Pending tool card stored before Checkout. Newsletter slots leave this unset. */
  creativeId?: string
}

export function parseSponsorCheckout(formData: FormData, env: Record<string, string | undefined> = process.env):
  | { ok: true; value: SponsorCheckoutInput }
  | { ok: false; message: string } {
  const offering = sponsorOffering(String(formData.get('offering') ?? ''))
  if (!offering) return { ok: false, message: 'Choose a sponsor slot.' }

  const email = emailSchema.safeParse(String(formData.get('email') ?? ''))
  if (!email.success) return { ok: false, message: 'Enter a valid work email.' }

  const company = sanitizeSponsorCompany(String(formData.get('company') ?? ''))
  if (!COMPANY.test(company)) return { ok: false, message: 'Enter the company name.' }

  const requestId = String(formData.get('request_id') ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { ok: false, message: 'Refresh the page and try again.' }
  }

  const taskRaw = String(formData.get('task_slug') ?? '').trim()
  const issueRaw = String(formData.get('issue_date') ?? '').trim()
  let taskSlug: string | null = null
  let issueDate: string | null = null

  if (offering.target === 'task') {
    if (!TASKS.has(taskRaw)) return { ok: false, message: 'Choose a task page for this placement.' }
    taskSlug = taskRaw
  } else {
    const parsedDate = parseIssueDate(issueRaw)
    if (!parsedDate) return { ok: false, message: 'Choose the newsletter issue date.' }
    issueDate = parsedDate
  }

  const priceId = sponsorPriceId(offering.id, env)
  if (!priceId) return { ok: false, message: 'That offering is not available yet.' }
  const setupPriceId = 'setup' in offering ? sponsorSetupPriceId(offering.id, env) : null
  if ('setup' in offering && !setupPriceId) return { ok: false, message: 'That offering is not available yet.' }

  return {
    ok: true,
    value: {
      offering: offering.id,
      email: email.data,
      company,
      taskSlug,
      issueDate,
      priceId,
      setupPriceId,
      requestId,
    },
  }
}

function parseIssueDate(value: string): string | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const today = new Date()
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const end = start + 540 * 24 * 60 * 60 * 1000
  if (date.getTime() < start || date.getTime() > end) return null
  return value
}

export function sponsorCheckoutParams(input: SponsorCheckoutInput & {
  successUrl: string
  cancelUrl: string
  /** The hold's claimed_at (ms) from claimSponsorSlot. Required for founding: it sets the session's expires_at. */
  claimedAt?: number
  /** When the params are built (ms). Founding only: keeps expires_at inside Stripe's window. Defaults to Date.now(). */
  now?: number
}): { params: Stripe.Checkout.SessionCreateParams; idempotencyKey: string } {
  const offering = sponsorOffering(input.offering)
  if (!offering) throw new Error('unknown sponsor offering')
  const subscription = offering.billing === 'subscription'
  const notice = sponsorOfferingNotice(offering)
  const trialDays = sponsorTrialDays(offering)
  const lockMonths = sponsorPriceLockMonths(offering)
  const setupPriceId = subscription && 'setup' in offering ? input.setupPriceId ?? null : null
  if (subscription && 'setup' in offering && !setupPriceId) throw new Error('setup price is not configured')

  const metadata: Record<string, string> = {
    kind: 'sponsorship',
    offering: input.offering,
    email: input.email,
    company: input.company,
    task_slug: input.taskSlug ?? '',
    issue_date: input.issueDate ?? '',
    price_id: input.priceId,
    creative_id: input.creativeId ?? '',
  }
  if (subscription) {
    metadata.billing = 'subscription'
    metadata.setup_price_id = setupPriceId ?? ''
    metadata.trial_days = String(trialDays)
    metadata.price_lock_months = String(lockMonths)
  }
  // One-time offerings keep the original fingerprint fields, so a retried
  // form keeps the same idempotency key across this change.
  const fingerprintFields = [
    input.offering,
    input.email,
    input.company,
    input.taskSlug ?? '',
    input.issueDate ?? '',
    input.priceId,
    input.creativeId ?? '',
    input.successUrl,
    input.cancelUrl,
    SPONSOR_BUSINESS_NAME,
    notice,
  ]
  if (subscription) fingerprintFields.push('subscription', setupPriceId ?? '', String(trialDays), String(lockMonths))
  const fingerprintSource = fingerprintFields.join('\n')
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 16)
  const founding = input.offering === 'founding_sponsor'
  if (founding && (input.claimedAt == null || !Number.isFinite(input.claimedAt) || input.claimedAt <= 0)) {
    throw new Error('founding checkout needs its hold time')
  }
  // A founding key also carries the hold's claimed_at, the only input to its
  // expires_at that is not in the fingerprint. The same hold always sends the
  // same body under the same key; a new or renewed hold gets a new key, so a
  // retry can never reuse a key with a different expires_at. Founding holds
  // are never released early (releaseSponsorSlot), so a session Stripe may
  // already have made under an earlier key stays covered by its hold.
  const idempotencyKey = founding
    ? `sponsor-${fingerprint}-${input.requestId}-h${input.claimedAt}`
    : `sponsor-${fingerprint}-${input.requestId}`
  const shared = {
    customer_email: input.email,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    custom_text: {
      submit: { message: notice },
    },
    integration_identifier: SPONSOR_INTEGRATION_IDENTIFIER,
    // Advertising placements are not eligible for Managed Payments.
    // automatic_tax stays unset; this business remains the merchant of record.
    managed_payments: { enabled: false },
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>

  if (!subscription) {
    // Same keys in the same order as before subscriptions, so the encoded
    // request body of a retried one-time checkout does not change.
    return {
      idempotencyKey,
      params: {
        mode: 'payment',
        customer_email: input.email,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
        payment_intent_data: {
          metadata,
          statement_descriptor_suffix: SPONSOR_BUSINESS_NAME,
        },
        custom_text: shared.custom_text,
        integration_identifier: shared.integration_identifier,
        managed_payments: shared.managed_payments,
      },
    }
  }

  // Subscription mode. The recurring Price is first; a one-time setup Price
  // (founding $99) is billed on the first invoice even while the recurring
  // item is in its trial. The card is always collected, so the subscription
  // renews after the trial without another step.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: input.priceId, quantity: 1 }]
  if (setupPriceId) lineItems.push({ price: setupPriceId, quantity: 1 })
  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata,
    description: offering.productName,
  }
  if (trialDays > 0) subscriptionData.trial_period_days = trialDays
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    ...shared,
    line_items: lineItems,
    payment_method_collection: 'always',
    subscription_data: subscriptionData,
  }
  // A founding session ends 5 minutes before its hold stops counting toward
  // the cap, so it cannot complete once the spot may have gone to someone else.
  if (founding) params.expires_at = foundingCheckoutExpiresAt(input.claimedAt as number, input.now ?? Date.now())
  return { idempotencyKey, params }
}
