import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createTestDatabase } from '@/test/db'
import { CHECKOUT_RECOVERY_EMAIL_LIVE, CHECKOUT_RECOVERY_RESEND_API_KEY } from './checkout-recovery-mail'
import { suppressRecoveryEmail } from './checkout-recovery-unsubscribe'
import { paymentLinkRecoveryEmails, sponsorAbandonedCheckouts, subscribers } from './db/schema'
import {
  PAYMENT_LINK_RECOVERY_ADDRESS,
  PAYMENT_LINK_RECOVERY_COOLDOWN_MS,
  PAYMENT_LINK_RECOVERY_OPT_OUT,
  parseExpiredPaymentLink,
  paymentLinkRecoveryMessage,
  recoverExpiredPaymentLink,
} from './payment-link-recovery'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { handleStripeWebhook } from './stripe-webhook'

const SECRET = 'whsec_payment_link_recovery'
const KEY = 're_test_key_123'
const FEATURED = SPONSOR_PAYMENT_LINKS.find((link) => link.id === 'featured_week')
if (!FEATURED) throw new Error('featured week payment link is missing')

const envKeys = [CHECKOUT_RECOVERY_RESEND_API_KEY, CHECKOUT_RECOVERY_EMAIL_LIVE] as const

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of envKeys) delete process.env[key]
})

function stripeStub(events: Stripe.Event[], retrieve?: (id: string) => Promise<unknown>): Stripe {
  return {
    webhooks: {
      constructEvent(rawBody: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== SECRET) throw new Error('invalid signature')
        const event = events.find((item) => JSON.stringify(item) === rawBody)
        if (!event) throw new Error('unknown body')
        return event
      },
    },
    paymentLinks: {
      async retrieve(id: string) {
        if (!retrieve) throw new Error('payment link lookup was not expected')
        return retrieve(id)
      },
    },
  } as unknown as Stripe
}

function expired(id: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id,
    type: 'checkout.session.expired',
    livemode: false,
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
    process.env[CHECKOUT_RECOVERY_RESEND_API_KEY] = KEY
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const optedOut = expired('evt_out', featuredSession('cs_test_out', { consent: { promotions: 'opt_out' } }))
    const missing = expired('evt_missing', featuredSession('cs_test_missing', { consent: undefined }))
    const stripe = stripeStub([optedOut, missing])
    expect(parseExpiredPaymentLink(optedOut)).toEqual({ ok: false, reason: 'no-consent' })
    expect(parseExpiredPaymentLink(missing)).toEqual({ ok: false, reason: 'no-consent' })
    const first = await handleStripeWebhook({
      rawBody: JSON.stringify(optedOut),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 10,
    })
    const second = await recoverExpiredPaymentLink(db, stripe, missing, 11, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(first).toEqual({ status: 200, body: { received: true } })
    expect(second).toEqual({ action: 'skipped', reason: 'no-consent' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await db.select().from(paymentLinkRecoveryEmails)).toEqual([])
    await close()
  })

  it('no email -> no send', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_RESEND_API_KEY] = KEY
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const session = featuredSession('cs_test_no_email', {
      customer_details: { name: 'Buyer' },
      customer_email: 'buyer@example.com',
    })
    const event = expired('evt_no_email', session)
    const stripe = stripeStub([event])
    expect(parseExpiredPaymentLink(event)).toEqual({ ok: false, reason: 'no-email' })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 12,
    })
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(await recoverExpiredPaymentLink(db, stripe, event, 13, { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({
      action: 'skipped',
      reason: 'no-email',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await db.select().from(paymentLinkRecoveryEmails)).toEqual([])
    await close()
  })

  it('opt_in -> one send', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_RESEND_API_KEY] = KEY
    const bodies: Array<Record<string, unknown>> = []
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe('https://api.resend.com/emails')
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe(`Bearer ${KEY}`)
      expect(headers.get('Idempotency-Key')).toBe('cs_test_opt_in')
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response('{}', { status: 200 })
    })
    const event = expired('evt_opt_in', featuredSession('cs_test_opt_in', { payment_link: { id: FEATURED?.paymentLinkId } }))
    const stripe = stripeStub([event])
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 21,
    })
    expect(result).toEqual({ status: 200, body: { received: true } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = bodies[0]
    expect(body?.from).toBe('mark@bestbotfor.com')
    expect(body?.to).toEqual(['buyer@example.com'])
    const text = String(body?.text)
    expect(text).toContain(`You started checkout for ${FEATURED?.title}. Here's the link to finish:`)
    expect(text).toContain(FEATURED?.url)
    const addressAt = text.indexOf(PAYMENT_LINK_RECOVERY_ADDRESS)
    const optOutAt = text.indexOf(PAYMENT_LINK_RECOVERY_OPT_OUT)
    expect(addressAt).toBeGreaterThan(-1)
    expect(optOutAt).toBeGreaterThan(addressAt)
    expect(text.endsWith(`${PAYMENT_LINK_RECOVERY_ADDRESS}\n${PAYMENT_LINK_RECOVERY_OPT_OUT}`)).toBe(true)
    expect(String(body?.html)).toContain(PAYMENT_LINK_RECOVERY_ADDRESS)
    expect(String(body?.html)).toContain(PAYMENT_LINK_RECOVERY_OPT_OUT)
    expect(String(body?.html)).not.toMatch(/<script/i)
    const rows = await db.select().from(paymentLinkRecoveryEmails)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      stripeCheckoutSessionId: 'cs_test_opt_in',
      email: 'buyer@example.com',
      paymentLinkId: FEATURED?.paymentLinkId,
      recoveryUrl: FEATURED?.url,
      sentAt: 21,
    })
    await close()
  })

  it('duplicate event -> no second send', async () => {
    const { db, close } = await createTestDatabase()
    process.env[CHECKOUT_RECOVERY_RESEND_API_KEY] = KEY
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    })
    const session = featuredSession('cs_test_dup')
    const first = expired('evt_dup_1', session)
    const again = expired('evt_dup_1', session)
    const otherEvent = expired('evt_dup_2', session)
    const stripe = stripeStub([first, again, otherEvent])
    const env = { [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY }
    const sent = await recoverExpiredPaymentLink(db, stripe, first, 30, { env, fetchImpl: fetchImpl as unknown as typeof fetch })
    const sameEvent = await handleStripeWebhook({
      rawBody: JSON.stringify(again),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 31,
    })
    const other = await recoverExpiredPaymentLink(db, stripe, otherEvent, 32, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(sent).toEqual({ action: 'sent' })
    expect(sameEvent.status).toBe(200)
    expect(other.action).toBe('skipped')
    expect(calls).toBe(1)
    expect(await db.select().from(paymentLinkRecoveryEmails)).toHaveLength(1)

    await db
      .update(paymentLinkRecoveryEmails)
      .set({ createdAt: 30 - PAYMENT_LINK_RECOVERY_COOLDOWN_MS - 1 })
      .where(eq(paymentLinkRecoveryEmails.stripeCheckoutSessionId, 'cs_test_dup'))
    const afterWindow = await recoverExpiredPaymentLink(db, stripe, expired('evt_dup_3', session), 30 + PAYMENT_LINK_RECOVERY_COOLDOWN_MS + 1, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(afterWindow).toEqual({ action: 'skipped', reason: 'duplicate' })
    expect(calls).toBe(1)
    await close()
  })

  it('skips a suppressed address, an unsubscribed subscriber, and a second address inside 7 days', async () => {
    const { db, close } = await createTestDatabase()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const env = { [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY }
    const stripe = stripeStub([])
    await suppressRecoveryEmail(db, 'buyer@example.com', 'one_click', 1)
    const suppressed = await recoverExpiredPaymentLink(db, stripe, expired('evt_suppressed', featuredSession('cs_test_suppressed')), 40, {
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(suppressed).toEqual({ action: 'skipped', reason: 'suppressed' })

    await db.insert(subscribers).values({
      email: 'news@example.com',
      createdAt: 1,
      destination: 'beehiiv',
      status: 'unsubscribed',
    })
    const unsubscribed = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_unsub', featuredSession('cs_test_unsub', { customer_details: { email: 'news@example.com' } })),
      41,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(unsubscribed).toEqual({ action: 'skipped', reason: 'suppressed' })

    const first = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_week_1', featuredSession('cs_test_week_1', { customer_details: { email: 'fresh@example.com' } })),
      1_000,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const soon = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_week_2', featuredSession('cs_test_week_2', { customer_details: { email: 'fresh@example.com' } })),
      1_000 + PAYMENT_LINK_RECOVERY_COOLDOWN_MS - 1,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    const later = await recoverExpiredPaymentLink(
      db,
      stripe,
      expired('evt_week_3', featuredSession('cs_test_week_3', { customer_details: { email: 'fresh@example.com' } })),
      1_000 + PAYMENT_LINK_RECOVERY_COOLDOWN_MS + 1,
      { env, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(first).toEqual({ action: 'sent' })
    expect(soon).toEqual({ action: 'skipped', reason: 'cooldown' })
    expect(later).toEqual({ action: 'sent' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await close()
  })

  it('looks up an unknown Payment Link and refuses a url that is not buy.stripe.com', async () => {
    const { db, close } = await createTestDatabase()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const env = { [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY }
    const good = expired('evt_unknown', featuredSession('cs_test_unknown', { payment_link: 'plink_unknownlookup01' }))
    const bad = expired('evt_bad_url', featuredSession('cs_test_bad_url', { payment_link: 'plink_evillookup0001' }))
    const stripe = stripeStub([], async (id) => {
      if (id === 'plink_evillookup0001') return { url: 'https://evil.example/phish', line_items: { data: [] } }
      return {
        url: 'https://buy.stripe.com/test_unknown_link',
        line_items: { data: [{ price: { product: { name: 'Smoke <test>' } } }] },
      }
    })
    const sent = await recoverExpiredPaymentLink(db, stripe, good, 50, { env, fetchImpl: fetchImpl as unknown as typeof fetch })
    const refused = await recoverExpiredPaymentLink(db, stripe, bad, 51, { env, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(sent).toEqual({ action: 'sent' })
    expect(refused).toEqual({ action: 'skipped', reason: 'no-url' })
    const message = paymentLinkRecoveryMessage({
      sessionId: 'cs_test_unknown',
      email: 'buyer@example.com',
      productName: 'Smoke <test>',
      url: 'https://buy.stripe.com/test_unknown_link',
    })
    expect(message?.text).toContain('Smoke <test>')
    expect(message?.html).toContain('Smoke &lt;test&gt;')
    expect(message?.html).not.toContain('Smoke <test>')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await close()
  })

  it('does not send a live event unless the live flag is exactly true', async () => {
    const { db, close } = await createTestDatabase()
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const event = { ...expired('evt_live', featuredSession('cs_test_live')), livemode: true } as Stripe.Event
    const stripe = stripeStub([event])
    const off = await recoverExpiredPaymentLink(db, stripe, event, 60, {
      env: { [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const on = await recoverExpiredPaymentLink(db, stripe, event, 61, {
      env: { [CHECKOUT_RECOVERY_RESEND_API_KEY]: KEY, [CHECKOUT_RECOVERY_EMAIL_LIVE]: 'true' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(off).toEqual({ action: 'skipped', reason: 'live-email-off' })
    expect(on).toEqual({ action: 'sent' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await db.select().from(sponsorAbandonedCheckouts)).toEqual([])
    await close()
  })
})
