import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { POST } from '@/app/checkout-recovery/unsubscribe/route'
import { createTestDatabase } from '@/test/db'
import { claimRecoveryAddress, markRecoveryAddressFailed } from './checkout-recovery-claim'
import {
  CHECKOUT_RECOVERY_EMAIL_LIVE,
  CHECKOUT_RECOVERY_FROM_EMAIL,
  CHECKOUT_RECOVERY_PAYMENT_LINK_IDS,
  CHECKOUT_RECOVERY_POSTAL_ADDRESS,
  CHECKOUT_RECOVERY_RESEND_API_KEY,
  PAYMENT_LINK_RECOVERY_DEFAULT_FROM,
  paymentLinkFromEmail,
} from './checkout-recovery-mail'
import { CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET, checkoutRecoveryUnsubscribeToken } from './checkout-recovery-unsubscribe'
import { getDb, resetDbCache } from './db/client'
import {
  checkoutRecoveryAddressClaims,
  checkoutRecoverySuppressions,
  paymentLinkRecoveryEmails,
  sponsorAbandonedCheckouts,
} from './db/schema'
import {
  PAYMENT_LINK_RECOVERY_OPT_OUT,
  checkoutRecoveryPaymentLinkIds,
  parseExpiredPaymentLink,
  recoverExpiredPaymentLink,
} from './payment-link-recovery'
import { recordExpiredSponsorCheckout } from './sponsor-abandoned'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { handleStripeWebhook } from './stripe-webhook'

const WEBHOOK_SECRET = 'whsec_payment_link_recovery'
const KEY = 're_test_key_123'
const POSTAL = '1 Test Street, Test City, TS 00000'
const UNSUBSCRIBE_SECRET = 'u'.repeat(32)
const FEATURED = SPONSOR_PAYMENT_LINKS.find((link) => link.id === 'featured_week')
const MONTHLY = SPONSOR_PAYMENT_LINKS.find((link) => link.id === 'sponsor_monthly')
if (!FEATURED || !MONTHLY) throw new Error('sponsor payment links are missing')

const envKeys = [
  CHECKOUT_RECOVERY_RESEND_API_KEY,
  CHECKOUT_RECOVERY_EMAIL_LIVE,
  CHECKOUT_RECOVERY_POSTAL_ADDRESS,
  CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET,
  CHECKOUT_RECOVERY_PAYMENT_LINK_IDS,
  CHECKOUT_RECOVERY_FROM_EMAIL,
  'TURSO_DATABASE_URL',
] as const

afterEach(() => {
  vi.restoreAllMocks()
  resetDbCache()
  for (const key of envKeys) delete process.env[key]
})

function mailEnv(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY,
    [CHECKOUT_RECOVERY_POSTAL_ADDRESS]: POSTAL,
    [CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET]: UNSUBSCRIBE_SECRET,
    [CHECKOUT_RECOVERY_PAYMENT_LINK_IDS]: FEATURED?.paymentLinkId,
    ...extra,
  }
}

function stripeStub(events: Stripe.Event[] = [], retrieve?: (id: string) => Promise<unknown> | unknown): Stripe & { retrieves: string[] } {
  const retrieves: string[] = []
  const stripe = {
    retrieves,
    webhooks: {
      constructEvent(rawBody: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== WEBHOOK_SECRET) throw new Error('invalid signature')
        const event = events.find((item) => JSON.stringify(item) === rawBody)
        if (!event) throw new Error('unknown body')
        return event
      },
    },
    paymentLinks: {
      async retrieve(id: string) {
        retrieves.push(id)
        if (!retrieve) throw new Error('payment link lookup was not expected')
        return retrieve(id)
      },
    },
  }
  return stripe as unknown as Stripe & { retrieves: string[] }
}

function activeLink(id: string) {
  const known = SPONSOR_PAYMENT_LINKS.find((link) => link.paymentLinkId === id)
  return {
    id,
    active: true,
    url: known?.url ?? 'https://buy.stripe.com/test_allowlisted_link',
    line_items: { data: [{ price: { product: { name: known?.title ?? 'Audit' } } }] },
  }
}

function expired(id: string, object: Record<string, unknown>, livemode = false): Stripe.Event {
  return {
    id,
    type: 'checkout.session.expired',
    livemode,
    data: { object },
  } as unknown as Stripe.Event
}

function featuredSession(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    payment_status: 'unpaid',
    payment_link: FEATURED?.paymentLinkId,
    consent: { promotions: 'opt_in' },
    customer_details: { email: 'Buyer@Example.com' },
    ...extra,
  }
}

describe('payment link recovery email', () => {
  it('no consent -> no send', async () => {
    const { db, close } = await createTestDatabase()
    const stripe = stripeStub([], activeLink)
    const optedOut = expired('evt_out', featuredSession('cs_test_out', { consent: { promotions: 'opt_out' } }))
    expect(parseExpiredPaymentLink(optedOut)).toEqual({ ok: false, reason: 'no-consent' })
    const result = await recoverExpiredPaymentLink(db, stripe, optedOut, 10, { env: mailEnv() })
    expect(result).toEqual({ action: 'skipped', reason: 'no-consent' })
    expect(stripe.retrieves).toEqual([])
    expect(await db.select().from(paymentLinkRecoveryEmails)).toEqual([])
    await close()
  })

  it('no email -> no send', async () => {
    const { db, close } = await createTestDatabase()
    const event = expired(
      'evt_no_email',
      featuredSession('cs_test_no_email', { customer_details: { name: 'Buyer' }, customer_email: 'buyer@example.com' }),
    )
    const stripe = stripeStub([event], activeLink)
    expect(parseExpiredPaymentLink(event)).toEqual({ ok: false, reason: 'no-email' })
    const webhook = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: WEBHOOK_SECRET,
      now: 12,
    })
    expect(webhook).toEqual({ status: 200, body: { received: true } })
    expect(stripe.retrieves).toEqual([])
    expect(await db.select().from(paymentLinkRecoveryEmails)).toEqual([])
    await close()
  })

  it('opt_in -> one send, with the unsubscribe headers and the env postal address', async () => {
    const { db, close } = await createTestDatabase()
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(`Bearer ${KEY}`)
      expect(headers.get('Idempotency-Key')).toBe('checkout-recovery-cs_test_opt_in')
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response('{}', { status: 200 })
    })
    const stripe = stripeStub([], activeLink)
    const event = expired('evt_opt_in', featuredSession('cs_test_opt_in', { payment_link: { id: FEATURED?.paymentLinkId } }))
    const result = await recoverExpiredPaymentLink(db, stripe, event, 21, {
      env: mailEnv({ [CHECKOUT_RECOVERY_FROM_EMAIL]: 'ops@example.com' }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ action: 'sent' })
    expect(stripe.retrieves).toEqual([FEATURED?.paymentLinkId])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = bodies[0]
    expect(body?.from).toBe('ops@example.com')
    expect(body?.reply_to).toBe('ops@example.com')
    expect(body?.to).toEqual(['buyer@example.com'])
    const text = String(body?.text)
    expect(text).toContain(`You started checkout for ${FEATURED?.title}. Here's the link to finish:`)
    expect(text).toContain(FEATURED?.url)
    expect(text).toContain('/checkout-recovery/unsubscribe?token=')
    expect(text.endsWith(`${POSTAL}\n${PAYMENT_LINK_RECOVERY_OPT_OUT}`)).toBe(true)
    expect(text).not.toContain('2525 Pointe Center Court')
    const headers = body?.headers as Record<string, string>
    expect(headers['List-Unsubscribe']).toContain('checkout-recovery/unsubscribe?token=')
    expect(headers['List-Unsubscribe']).toContain('mailto:privacy@bestbotfor.com?subject=Unsubscribe')
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(String(body?.html)).not.toMatch(/<script/i)
    const rows = await db.select().from(paymentLinkRecoveryEmails)
    expect(rows[0]).toMatchObject({ sendStatus: 'sent', sentAt: 21, email: 'buyer@example.com' })
    await close()
  })

  it('uses mark@bestbotfor.com when CHECKOUT_RECOVERY_FROM_EMAIL is unset', () => {
    expect(mailEnv()[CHECKOUT_RECOVERY_FROM_EMAIL]).toBeUndefined()
    expect(PAYMENT_LINK_RECOVERY_DEFAULT_FROM).toBe('mark@bestbotfor.com')
    expect(paymentLinkFromEmail({})).toBe('mark@bestbotfor.com')
    expect(paymentLinkFromEmail({ [CHECKOUT_RECOVERY_FROM_EMAIL]: '  ' })).toBe('mark@bestbotfor.com')
    expect(paymentLinkFromEmail({ [CHECKOUT_RECOVERY_FROM_EMAIL]: 'ops@example.com' })).toBe('ops@example.com')
    expect(paymentLinkFromEmail({ [CHECKOUT_RECOVERY_FROM_EMAIL]: 'not an email' })).toBeNull()
    expect(checkoutRecoveryPaymentLinkIds({})).toEqual(new Set())
    expect(checkoutRecoveryPaymentLinkIds({ [CHECKOUT_RECOVERY_PAYMENT_LINK_IDS]: ' , not-a-link, plink_abc123 ' })).toEqual(
      new Set(['plink_abc123']),
    )
  })

  it('duplicate event -> no second send', async () => {
    const { db, close } = await createTestDatabase()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const stripe = stripeStub([], activeLink)
    const env = mailEnv()
    const session = featuredSession('cs_test_dup')
    const first = await recoverExpiredPaymentLink(db, stripe, expired('evt_dup_1', session), 30, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const again = await recoverExpiredPaymentLink(db, stripe, expired('evt_dup_2', session), 31, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(first).toEqual({ action: 'sent' })
    expect(again.action).toBe('skipped')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await close()
  })

  it('does not call Stripe when the live flag is off or the allowlist is empty', async () => {
    const { db, close } = await createTestDatabase()
    const live = expired('evt_live', featuredSession('cs_test_live'), true)
    const stripe = stripeStub([live], () => {
      throw new Error('stripe was called')
    })
    const off = await recoverExpiredPaymentLink(db, stripe, live, 40, { env: mailEnv() })
    expect(off).toEqual({ action: 'skipped', reason: 'live-email-off' })
    const empty = await recoverExpiredPaymentLink(db, stripe, expired('evt_empty', featuredSession('cs_test_empty')), 41, {
      env: mailEnv({ [CHECKOUT_RECOVERY_PAYMENT_LINK_IDS]: '  ' }),
    })
    expect(empty).toEqual({ action: 'skipped', reason: 'not-allowlisted' })
    const webhook = await handleStripeWebhook({
      rawBody: JSON.stringify(live),
      signature: 'valid',
      db,
      stripe,
      secret: WEBHOOK_SECRET,
      now: 42,
      allowLive: true,
    })
    expect(webhook.status).toBe(200)
    expect(stripe.retrieves).toEqual([])
    await close()
  })

  it('does not email an inactive link, and does not email the Monthly link a second time', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_POSTAL_ADDRESS] = POSTAL
    process.env[CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET] = UNSUBSCRIBE_SECRET
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const stripe = stripeStub([], (id) => ({ ...activeLink(id), active: id !== FEATURED?.paymentLinkId }))
    const inactive = await recoverExpiredPaymentLink(db, stripe, expired('evt_inactive', featuredSession('cs_test_inactive')), 50, {
      env: mailEnv(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(inactive).toEqual({ action: 'skipped', reason: 'inactive' })
    let inApp = 0
    const monthly = expired('evt_monthly', {
      id: 'cs_test_monthly',
      payment_status: 'unpaid',
      payment_link: MONTHLY?.paymentLinkId,
      consent: { promotions: 'opt_in' },
      customer_details: { email: 'monthly@example.com' },
      metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
    })
    await recordExpiredSponsorCheckout(db, monthly, 51, async () => {
      inApp += 1
      return 'sent'
    })
    const second = await recoverExpiredPaymentLink(db, stripe, monthly, 52, {
      env: mailEnv({ [CHECKOUT_RECOVERY_PAYMENT_LINK_IDS]: `${FEATURED?.paymentLinkId},${MONTHLY?.paymentLinkId}` }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(inApp).toBe(1)
    expect(second).toEqual({ action: 'skipped', reason: 'sponsor-checkout' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stripe.retrieves).toEqual([FEATURED?.paymentLinkId])
    await close()
  })

  it('a Resend 4xx does not start the 7-day window, and a sent row blocks both senders', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_POSTAL_ADDRESS] = POSTAL
    process.env[CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET] = UNSUBSCRIBE_SECRET
    const fetchImpl = vi.fn(async () => new Response('no', { status: 422 }))
    const stripe = stripeStub([], activeLink)
    const env = mailEnv()
    const rejected = await recoverExpiredPaymentLink(db, stripe, expired('evt_4xx', featuredSession('cs_test_4xx')), 60, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(rejected).toEqual({ action: 'skipped', reason: 'rejected' })
    const row = await db.select().from(paymentLinkRecoveryEmails)
    expect(row[0]).toMatchObject({ sendStatus: 'failed', sentAt: null })
    fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const again = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_after_4xx', featuredSession('cs_test_after_4xx')),
      61,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(again).toEqual({ action: 'sent' })
    const blocked = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_week', featuredSession('cs_test_week', { customer_details: { email: 'buyer@example.com' } })),
      62,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(blocked).toEqual({ action: 'skipped', reason: 'cooldown' })
    let inApp = 0
    await recordExpiredSponsorCheckout(
      db,
      expired('evt_in_app', {
        id: 'cs_test_in_app_after',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: { kind: 'sponsorship', offering: 'newsletter_slot', email: 'buyer@example.com' },
      }),
      63,
      async () => {
        inApp += 1
        return 'sent'
      },
    )
    expect(inApp).toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await close()
  })

  it('an in-app send blocks a Payment Link send to the same address', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_POSTAL_ADDRESS] = POSTAL
    process.env[CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET] = UNSUBSCRIBE_SECRET
    let inApp = 0
    await recordExpiredSponsorCheckout(
      db,
      expired('evt_in_app_first', {
        id: 'cs_test_in_app_first',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: { kind: 'sponsorship', offering: 'newsletter_slot', email: 'buyer@example.com' },
      }),
      70,
      async () => {
        inApp += 1
        return 'sent'
      },
    )
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const stripe = stripeStub([], activeLink)
    const result = await recoverExpiredPaymentLink(db, stripe, expired('evt_after_in_app', featuredSession('cs_test_after_in_app')), 71, {
      env: mailEnv(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(inApp).toBe(1)
    expect(result).toEqual({ action: 'skipped', reason: 'cooldown' })
    expect(fetchImpl).not.toHaveBeenCalled()
    await close()
  })

  it('claims an address once, then allows another claim only after a failed send', async () => {
    const { db, close } = await createTestDatabase()
    const first = await claimRecoveryAddress(db, 'Race@Example.com', 'cs_test_race_a', 80)
    const second = await claimRecoveryAddress(db, 'race@example.com', 'cs_test_race_b', 80)
    expect(first).toBe('claimed')
    expect(second).toBe('cooldown')
    await markRecoveryAddressFailed(db, 'race@example.com', 'cs_test_race_a')
    const afterFailure = await claimRecoveryAddress(db, 'race@example.com', 'cs_test_race_b', 81)
    expect(afterFailure).toBe('claimed')
    const rows = await db.select().from(checkoutRecoveryAddressClaims)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.email).toBe('race@example.com')
    expect(rows[0]?.stripeCheckoutSessionId).toBe('cs_test_race_b')
    await close()
  })

  it('one-click POST and the confirmation POST suppress the address for both senders', async () => {
    const { db, url, close } = await createTestDatabase()
    process.env.TURSO_DATABASE_URL = url
    process.env[CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET] = UNSUBSCRIBE_SECRET
    process.env[CHECKOUT_RECOVERY_POSTAL_ADDRESS] = POSTAL
    resetDbCache()
    const token = checkoutRecoveryUnsubscribeToken(UNSUBSCRIBE_SECRET, 'buyer@example.com') ?? ''
    const oneClick = await POST(
      new Request(`https://bestbotfor.com/checkout-recovery/unsubscribe?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
      }),
    )
    expect(oneClick.status).toBe(200)
    const formToken = checkoutRecoveryUnsubscribeToken(UNSUBSCRIBE_SECRET, 'other@example.com') ?? ''
    const form = await POST(
      new Request(`https://bestbotfor.com/checkout-recovery/unsubscribe?token=${encodeURIComponent(formToken)}`, {
        method: 'POST',
        body: '',
      }),
    )
    expect(form.status).toBe(200)
    const suppressed = await db.select().from(checkoutRecoverySuppressions)
    expect(suppressed.map((row) => row.email).sort()).toEqual(['buyer@example.com', 'other@example.com'])
    expect(suppressed.find((row) => row.email === 'buyer@example.com')?.source).toBe('one_click')
    expect(suppressed.find((row) => row.email === 'other@example.com')?.source).toBe('confirm')

    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const stripe = stripeStub([], activeLink)
    const paymentLink = await recoverExpiredPaymentLink(db, stripe, expired('evt_unsub', featuredSession('cs_test_unsub_link')), 90, {
      env: mailEnv(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    let inApp = 0
    await recordExpiredSponsorCheckout(
      db,
      expired('evt_unsub_app', {
        id: 'cs_test_unsub_app',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: { kind: 'sponsorship', offering: 'newsletter_slot', email: 'other@example.com' },
      }),
      91,
      async () => {
        inApp += 1
        return 'sent'
      },
    )
    expect(paymentLink).toEqual({ action: 'skipped', reason: 'suppressed' })
    expect(inApp).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
    getDb().$client.close()
    resetDbCache()
    await close()
  })

  it('skips a send when the postal address or unsubscribe secret is missing, before Stripe', async () => {
    const { db, close } = await createTestDatabase()
    const stripe = stripeStub([], () => {
      throw new Error('stripe was called')
    })
    const event = expired('evt_compliance', featuredSession('cs_test_compliance'))
    const noPostal = await recoverExpiredPaymentLink(db, stripe, event, 100, {
      env: mailEnv({ [CHECKOUT_RECOVERY_POSTAL_ADDRESS]: '  ' }),
    })
    const noSecret = await recoverExpiredPaymentLink(db, stripe, expired('evt_secret', featuredSession('cs_test_secret')), 101, {
      env: mailEnv({ [CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET]: 'short' }),
    })
    expect(noPostal).toEqual({ action: 'skipped', reason: 'postal-address-missing' })
    expect(noSecret).toEqual({ action: 'skipped', reason: 'unsubscribe-secret-missing' })
    expect(stripe.retrieves).toEqual([])
    await close()
  })

  it('does not keep a sponsor row email that was already counted', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorAbandonedCheckouts).values({
      stripeCheckoutSessionId: 'cs_test_prior',
      email: 'buyer@example.com',
      offering: 'newsletter_slot',
      expiredAt: 1,
      source: 'checkout',
      promotionsConsent: 'opt_in',
      consentedAt: 1,
      createdAt: 1,
      recoveryEmailSentAt: 110,
    })
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const stripe = stripeStub([], activeLink)
    const result = await recoverExpiredPaymentLink(db, stripe, expired('evt_prior', featuredSession('cs_test_prior_link')), 111, {
      env: mailEnv(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ action: 'skipped', reason: 'cooldown' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await db.select().from(paymentLinkRecoveryEmails)).toEqual([])
    await close()
  })
})
