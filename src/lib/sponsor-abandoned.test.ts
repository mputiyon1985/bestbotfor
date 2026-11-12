import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { createTestDatabase } from '@/test/db'
import { applyMigrations } from './db/migrate'
import { sponsorAbandonedCheckouts, sponsorships } from './db/schema'
import { handleStripeWebhook } from './stripe-webhook'
import { parseExpiredSponsorCheckout, recordExpiredSponsorCheckout, RECOVERY_EMAIL_CLAIM_LEASE_MS, sponsorRecoveryUrl } from './sponsor-abandoned'
import { SPONSOR_PAYMENT_LINKS } from './sponsor-payment-links'
import { suppressRecoveryEmail } from './checkout-recovery-unsubscribe'
import type { CheckoutRecoveryMessage } from './checkout-recovery-mail'

const SECRET = 'whsec_test_secret'
const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function stripeStub(events: Stripe.Event[]): Stripe {
  return {
    webhooks: {
      constructEvent(rawBody: string, signature: string, secret: string) {
        if (signature !== 'valid' || secret !== SECRET) throw new Error('invalid signature')
        const event = events.find((item) => JSON.stringify(item) === rawBody)
        if (!event) throw new Error('unknown body')
        return event
      },
    },
    checkout: {
      sessions: {
        async retrieve() {
          throw new Error('expired sponsor checkout must not read the session back')
        },
      },
    },
  } as unknown as Stripe
}

function expired(id: string, object: Record<string, unknown>, created = 1_762_000_000): Stripe.Event {
  return {
    id,
    type: 'checkout.session.expired',
    created,
    livemode: false,
    data: { object },
  } as unknown as Stripe.Event
}

describe('parseExpiredSponsorCheckout', () => {
  it('keeps a Stripe recovery URL and rejects anything else', () => {
    expect(sponsorRecoveryUrl('https://buy.stripe.com/r/live_asAb1724')).toBe('https://buy.stripe.com/r/live_asAb1724')
    expect(sponsorRecoveryUrl('https://checkout.stripe.com/c/pay/cs_test_abc')).toBe('https://checkout.stripe.com/c/pay/cs_test_abc')
    expect(sponsorRecoveryUrl('https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02')).toBeNull()
    expect(sponsorRecoveryUrl('http://buy.stripe.com/r/live_asAb1724')).toBeNull()
    expect(sponsorRecoveryUrl('javascript:alert(1)')).toBeNull()
  })

  it('reads an in-app sponsor session from the email on the form', () => {
    const lead = parseExpiredSponsorCheckout(
      expired('evt_app', {
        id: 'cs_test_app',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: {
          kind: 'sponsorship',
          offering: 'placement_subscription',
          email: 'sponsor@example.com',
          task_slug: 'coding',
        },
        after_expiration: { recovery: { enabled: true, url: 'https://buy.stripe.com/r/test_recovery' } },
      }),
      50,
    )
    expect(lead).toMatchObject({
      sessionId: 'cs_test_app',
      email: 'sponsor@example.com',
      offering: 'placement_subscription',
      expiredAt: 1_762_000_000_000,
      taskSlug: 'coding',
      source: 'checkout',
      recoveryUrl: null,
      promotionsConsent: 'opt_in',
      consentedAt: 1_762_000_000_000,
    })
  })

  it('keeps a recovery URL for the newsletter slot and drops one on a scarce placement', () => {
    const newsletter = parseExpiredSponsorCheckout(
      expired('evt_news', {
        id: 'cs_test_news',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: { kind: 'sponsorship', offering: 'newsletter_slot', email: 'news@example.com' },
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_news' } },
      }),
      50,
    )
    expect(newsletter?.recoveryUrl).toBe('https://buy.stripe.com/r/test_news')
    const founding = parseExpiredSponsorCheckout(
      expired('evt_founding_url', {
        id: 'cs_test_founding_url',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        metadata: { kind: 'sponsorship', offering: 'founding_sponsor', email: 'founder@example.com', task_slug: 'writing' },
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_founding' } },
      }),
      50,
    )
    expect(founding?.recoveryUrl).toBeNull()
  })

  it('stores an opted-in membership checkout and ignores one without consent', () => {
    const lead = parseExpiredSponsorCheckout(
      expired('evt_member_in', {
        id: 'cs_test_member_in',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        customer_email: 'member@example.com',
        metadata: { clerkUserId: 'user_1', plan: 'annual', email: 'member@example.com' },
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_member' } },
      }),
      50,
    )
    expect(lead).toMatchObject({
      sessionId: 'cs_test_member_in',
      email: 'member@example.com',
      offering: 'membership_annual',
      source: 'checkout',
      recoveryUrl: 'https://buy.stripe.com/r/test_member',
      promotionsConsent: 'opt_in',
    })
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_member', {
          id: 'cs_test_member',
          payment_status: 'unpaid',
          customer_details: { email: 'member@example.com' },
          metadata: { clerkUserId: 'user_1', plan: 'annual' },
        }),
        50,
      ),
    ).toBeNull()
  })

  it('reads a Monthly Payment Link only when Stripe included an email', () => {
    const withEmail = parseExpiredSponsorCheckout(
      expired('evt_link', {
        id: 'cs_test_monthly',
        payment_status: 'unpaid',
        payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
        consent: { promotions: 'opt_in' },
        customer_details: { email: 'buyer@example.com' },
        metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
        custom_fields: [{ key: 'best_page', text: { value: 'SEO' } }],
      }),
      50,
    )
    expect(withEmail).toMatchObject({
      email: 'buyer@example.com',
      offering: 'sponsor_monthly',
      taskSlug: 'seo',
      source: 'payment_link',
      recoveryUrl: null,
    })
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_no_email', {
          id: 'cs_test_no_email',
          payment_status: 'unpaid',
          payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
          metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
        }),
        50,
      ),
    ).toBeNull()
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_no_consent', {
          id: 'cs_test_no_consent',
          payment_status: 'unpaid',
          payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
          customer_details: { email: 'buyer@example.com' },
          consent: { promotions: 'opt_out' },
          metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
        }),
        50,
      ),
    ).toBeNull()
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_metadata_only', {
          id: 'cs_test_metadata_only',
          payment_status: 'unpaid',
          customer_details: { email: 'buyer@example.com' },
          consent: { promotions: 'opt_in' },
          metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
        }),
        50,
      ),
    ).toBeNull()
  })

  it('ignores a paid session, a membership session with no consent, and a retired founding link that disagrees with its offer', () => {
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_paid', {
          id: 'cs_test_paid',
          payment_status: 'paid',
          metadata: { kind: 'sponsorship', offering: 'placement_monthly', email: 'sponsor@example.com' },
        }),
        50,
      ),
    ).toBeNull()
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_member', {
          id: 'cs_test_member',
          payment_status: 'unpaid',
          customer_details: { email: 'member@example.com' },
          metadata: { clerkUserId: 'user_1', plan: 'annual' },
        }),
        50,
      ),
    ).toBeNull()
    expect(
      parseExpiredSponsorCheckout(
        expired('evt_mismatch', {
          id: 'cs_test_mismatch',
          payment_status: 'unpaid',
          payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
          customer_email: 'buyer@example.com',
          metadata: { offer: 'founding_sponsor', source: 'payment_link' },
        }),
        50,
      ),
    ).toBeNull()
  })

  it('does not store an expired featured week or newsletter mention, even with a promotions opt-in', () => {
    const oneTime = SPONSOR_PAYMENT_LINKS.filter((link) => link.billing === 'one_time')
    expect(oneTime.map((link) => link.id)).toEqual(['featured_week', 'newsletter_mention'])
    for (const link of oneTime) {
      expect(
        parseExpiredSponsorCheckout(
          expired(`evt_${link.id}`, {
            id: `cs_test_${link.id}`,
            payment_status: 'unpaid',
            payment_link: link.paymentLinkId,
            customer_details: { email: 'buyer@example.com' },
            consent: { promotions: 'opt_in' },
            metadata: { offer: link.id, source: 'payment_link' },
            custom_fields: [
              {
                key: link.id === 'newsletter_mention' ? 'tool_name' : 'best_page',
                text: { value: 'coding' },
              },
            ],
          }),
          50,
        ),
      ).toBeNull()
    }
  })
})

describe('checkout.session.expired webhook', () => {
  it('records the lead once and does not open a sponsorship', async () => {
    const { db, close } = await createTestDatabase()
    const event = expired('evt_expire_once', {
      id: 'cs_test_once',
      payment_status: 'unpaid',
      consent: { promotions: 'opt_in' },
      metadata: { kind: 'sponsorship', offering: 'founding_sponsor', email: 'founder@example.com', task_slug: 'writing' },
    })
    const stripe = stripeStub([event])
    const first = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 90,
    })
    const second = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      now: 90,
    })
    expect(first).toEqual({ status: 200, body: { received: true } })
    expect(second).toEqual({ status: 200, body: { received: true, duplicate: true } })
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads).toHaveLength(1)
    expect(leads[0]).toMatchObject({
      stripeCheckoutSessionId: 'cs_test_once',
      email: 'founder@example.com',
      offering: 'founding_sponsor',
      expiredAt: 1_762_000_000_000,
      taskSlug: 'writing',
      source: 'checkout',
      recoveryUrl: null,
      promotionsConsent: 'opt_in',
      consentedAt: 1_762_000_000_000,
      createdAt: 90,
    })
    expect(await db.select().from(sponsorships)).toEqual([])
    await close()
  })

  it('fills a recovery URL on a later event for the same session and leaves the email', async () => {
    const { db, close } = await createTestDatabase()
    const firstEvent = expired('evt_expire_a', {
      id: 'cs_test_fill',
      payment_status: 'unpaid',
      customer_details: { email: 'buyer@example.com' },
      consent: { promotions: 'opt_in' },
      payment_link: { id: 'plink_1URyeXIJUbygfAucnLlkSP5u' },
      metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
    })
    const secondEvent = expired('evt_expire_b', {
      id: 'cs_test_fill',
      payment_status: 'unpaid',
      customer_details: { email: 'other@example.com' },
      consent: { promotions: 'opt_in' },
      payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
      metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
      after_expiration: { recovery: { url: 'https://buy.stripe.com/r/live_later' } },
    })
    const stripe = stripeStub([firstEvent, secondEvent])
    await handleStripeWebhook({ rawBody: JSON.stringify(firstEvent), signature: 'valid', db, stripe, secret: SECRET, now: 1 })
    await handleStripeWebhook({ rawBody: JSON.stringify(secondEvent), signature: 'valid', db, stripe, secret: SECRET, now: 2 })
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads).toHaveLength(1)
    expect(leads[0]?.email).toBe('buyer@example.com')
    expect(leads[0]?.recoveryUrl).toBe('https://buy.stripe.com/r/live_later')
    expect(leads[0]?.createdAt).toBe(1)
    await close()
  })
})

describe('recovery email', () => {
  const previous = {
    postal: process.env.CHECKOUT_RECOVERY_POSTAL_ADDRESS,
    secret: process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET,
  }
  beforeEach(() => {
    process.env.CHECKOUT_RECOVERY_POSTAL_ADDRESS = '1 Test Street, Test City, TS 00000'
    process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET = 'u'.repeat(32)
  })
  afterEach(() => {
    if (previous.postal === undefined) delete process.env.CHECKOUT_RECOVERY_POSTAL_ADDRESS
    else process.env.CHECKOUT_RECOVERY_POSTAL_ADDRESS = previous.postal
    if (previous.secret === undefined) delete process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET
    else process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET = previous.secret
  })

  function optedIn(offering: string, id = 'cs_test_mail', extra: Record<string, unknown> = {}): Stripe.Event {
    return expired('evt_mail', {
      id,
      payment_status: 'unpaid',
      consent: { promotions: 'opt_in' },
      metadata: { kind: 'sponsorship', offering, email: 'buyer@example.com', task_slug: 'writing' },
      ...extra,
    })
  }

  it('sends one email per session, with an unsubscribe line and no recovery URL for founding', async () => {
    const { db, close } = await createTestDatabase()
    const sent: CheckoutRecoveryMessage[] = []
    const mailer = async (message: CheckoutRecoveryMessage) => {
      sent.push(message)
      return 'sent' as const
    }
    const event = optedIn('founding_sponsor', 'cs_test_founding_mail', {
      after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_do_not_send' } },
    })
    await recordExpiredSponsorCheckout(db, event, 10, mailer)
    await recordExpiredSponsorCheckout(db, { ...event, id: 'evt_mail_again' } as Stripe.Event, 11, mailer)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('buyer@example.com')
    expect(sent[0]?.text).toContain('https://bestbotfor.com/sponsor')
    expect(sent[0]?.text).toContain('1 Test Street, Test City, TS 00000')
    expect(sent[0]?.text).toContain('/checkout-recovery/unsubscribe?token=')
    expect(sent[0]?.listUnsubscribePost).toBe('List-Unsubscribe=One-Click')
    expect(sent[0]?.text).not.toContain('buy.stripe.com/r/')
    expect(sent[0]?.html).toContain('privacy@bestbotfor.com')
    expect(sent[0]?.html).toContain('Mark Putiyon')
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads).toHaveLength(1)
    expect(leads[0]?.recoveryUrl).toBeNull()
    expect(leads[0]?.recoveryEmailSentAt).toBe(10)
    await close()
  })

  it('puts the Stripe recovery URL in the newsletter email and does not send without opt-in', async () => {
    const { db, close } = await createTestDatabase()
    const sent: CheckoutRecoveryMessage[] = []
    const mailer = async (message: CheckoutRecoveryMessage) => {
      sent.push(message)
      return 'sent' as const
    }
    const newsletter = optedIn('newsletter_slot', 'cs_test_news_mail', {
      after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_news_mail' } },
    })
    await recordExpiredSponsorCheckout(db, newsletter, 20, mailer)
    const optedOut = expired('evt_out', {
      id: 'cs_test_out',
      payment_status: 'unpaid',
      consent: { promotions: 'opt_out' },
      metadata: { kind: 'sponsorship', offering: 'newsletter_slot', email: 'out@example.com' },
    })
    await recordExpiredSponsorCheckout(db, optedOut, 21, mailer)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain('https://buy.stripe.com/r/test_news_mail')
    expect(sent[0]?.text).toContain('30 days')
    expect(await db.select().from(sponsorAbandonedCheckouts)).toHaveLength(1)
    await close()
  })

  it('clears the claim and throws when the sender asks for a retry, then sends once', async () => {
    const { db, close } = await createTestDatabase()
    let calls = 0
    const mailer = async () => {
      calls += 1
      return calls === 1 ? ('retry' as const) : ('sent' as const)
    }
    const event = optedIn('placement_subscription', 'cs_test_retry')
    await expect(recordExpiredSponsorCheckout(db, event, 30, mailer)).rejects.toThrow('checkout recovery email retry')
    const afterFail = await db.select().from(sponsorAbandonedCheckouts)
    expect(afterFail[0]?.recoveryEmailSentAt).toBeNull()
    await recordExpiredSponsorCheckout(db, { ...event, id: 'evt_retry_2' } as Stripe.Event, 31, mailer)
    expect(calls).toBe(2)
    const afterSend = await db.select().from(sponsorAbandonedCheckouts)
    expect(afterSend[0]?.recoveryEmailSentAt).toBe(31)
    await close()
  })

  it('clears the claim and does not throw when the sender rejects the message', async () => {
    const { db, close } = await createTestDatabase()
    const event = optedIn('placement_weekly', 'cs_test_reject')
    await recordExpiredSponsorCheckout(db, event, 35, async () => 'rejected')
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads[0]?.recoveryEmailSentAt).toBeNull()
    await close()
  })

  it('does not claim or send when the postal address is blank', async () => {
    const { db, close } = await createTestDatabase()
    process.env.CHECKOUT_RECOVERY_POSTAL_ADDRESS = '  '
    let calls = 0
    await recordExpiredSponsorCheckout(db, optedIn('newsletter_slot', 'cs_test_no_address'), 12, async () => {
      calls += 1
      return 'sent'
    })
    expect(calls).toBe(0)
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads[0]?.recoveryEmailSentAt).toBeNull()
    expect(leads[0]?.recoveryEmailClaimedAt).toBeNull()
    await close()
  })

  it('does not send to a suppressed address', async () => {
    const { db, close } = await createTestDatabase()
    await suppressRecoveryEmail(db, 'Buyer@Example.com', 'one_click', 1)
    let calls = 0
    await recordExpiredSponsorCheckout(db, optedIn('newsletter_slot', 'cs_test_suppressed'), 13, async () => {
      calls += 1
      return 'sent'
    })
    expect(calls).toBe(0)
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads[0]?.recoveryEmailClaimedAt).toBeNull()
    expect(leads[0]?.recoveryEmailSentAt).toBeNull()
    await close()
  })

  it('keeps a fresh lease and allows another try after the lease expires', async () => {
    const { db, close } = await createTestDatabase()
    const event = optedIn('newsletter_slot', 'cs_test_lease', {
      after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_lease' } },
    })
    await recordExpiredSponsorCheckout(db, event, 100, async () => 'sent')
    const held = await db.select().from(sponsorAbandonedCheckouts)
    expect(held[0]?.recoveryEmailSentAt).toBe(100)
    await db
      .update(sponsorAbandonedCheckouts)
      .set({ recoveryEmailSentAt: null, recoveryEmailClaimedAt: 100 })
      .where(eq(sponsorAbandonedCheckouts.stripeCheckoutSessionId, 'cs_test_lease'))
    let calls = 0
    await recordExpiredSponsorCheckout(db, { ...event, id: 'evt_lease_held' } as Stripe.Event, 100 + 1_000, async () => {
      calls += 1
      return 'sent'
    })
    expect(calls).toBe(0)
    await recordExpiredSponsorCheckout(
      db,
      { ...event, id: 'evt_lease_free' } as Stripe.Event,
      100 + RECOVERY_EMAIL_CLAIM_LEASE_MS + 1,
      async () => {
        calls += 1
        return 'sent'
      },
    )
    expect(calls).toBe(1)
    const freed = await db.select().from(sponsorAbandonedCheckouts)
    expect(freed[0]?.recoveryEmailSentAt).toBe(100 + RECOVERY_EMAIL_CLAIM_LEASE_MS + 1)
    await close()
  })

  it('drops a membership recovery URL when the founding coupon was attached', () => {
    const withCoupon = parseExpiredSponsorCheckout(
      expired('evt_member_coupon', {
        id: 'cs_test_member_coupon',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        customer_email: 'member@example.com',
        metadata: { clerkUserId: 'user_1', plan: 'annual', founding_coupon: '1' },
        discounts: [{ coupon: 'bbf_founding_19_first_year' }],
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_member_coupon' } },
      }),
      50,
    )
    expect(withCoupon?.recoveryUrl).toBeNull()
    const open = parseExpiredSponsorCheckout(
      expired('evt_member_open', {
        id: 'cs_test_member_open',
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        customer_email: 'member@example.com',
        metadata: { clerkUserId: 'user_1', plan: 'annual', founding_coupon: '0' },
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_member_open' } },
      }),
      50,
    )
    expect(open?.recoveryUrl).toBe('https://buy.stripe.com/r/test_member_open')
  })

  it('does not store or email a one-time Payment Link, or any other source=payment_link session without kind=sponsorship', async () => {
    const { db, close } = await createTestDatabase()
    const sent: CheckoutRecoveryMessage[] = []
    const mailer = async (message: CheckoutRecoveryMessage) => {
      sent.push(message)
      return 'sent' as const
    }
    const oneTime = SPONSOR_PAYMENT_LINKS.filter((link) => link.billing === 'one_time')
    expect(oneTime.map((link) => link.paymentLinkId)).toEqual([
      'plink_1Uaz53IJUbygfAucHbIqUfzb',
      'plink_1Uaz54IJUbygfAuckBQccflM',
    ])
    const sessions: Record<string, unknown>[] = [
      ...oneTime.map((link) => ({
        id: `cs_test_${link.id}`,
        payment_link: link.paymentLinkId,
        metadata: { offer: link.id, source: 'payment_link' },
        custom_fields: [
          { key: link.id === 'newsletter_mention' ? 'tool_name' : 'best_page', text: { value: 'coding' } },
        ],
      })),
      {
        id: 'cs_test_unknown_plink',
        payment_link: 'plink_unknown_not_allowlisted',
        metadata: { source: 'payment_link', offer: 'something_else' },
      },
      {
        id: 'cs_test_source_only',
        metadata: { source: 'payment_link', clerkUserId: 'user_1', plan: 'annual' },
      },
      {
        id: 'cs_test_one_time_member_shape',
        payment_link: { id: 'plink_1Uaz53IJUbygfAucHbIqUfzb' },
        metadata: { source: 'payment_link', clerkUserId: 'user_1', plan: 'monthly' },
      },
    ]
    for (const [index, session] of sessions.entries()) {
      const event = expired(`evt_no_recovery_${index}`, {
        ...session,
        payment_status: 'unpaid',
        consent: { promotions: 'opt_in' },
        customer_details: { email: 'buyer@example.com' },
        after_expiration: { recovery: { url: 'https://buy.stripe.com/r/test_should_not_send' } },
      })
      expect(parseExpiredSponsorCheckout(event, 50)).toBeNull()
      await recordExpiredSponsorCheckout(db, event, 50, mailer)
    }
    expect(sent).toEqual([])
    expect(await db.select().from(sponsorAbandonedCheckouts)).toEqual([])
    await close()
  })

  it('records an opted-in Payment Link and does not send when mail is off', async () => {
    const { db, close } = await createTestDatabase()
    const event = expired('evt_link_mail', {
      id: 'cs_test_link_mail',
      payment_status: 'unpaid',
      payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
      consent: { promotions: 'opt_in' },
      customer_details: { email: 'link@example.com' },
      metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
    })
    await recordExpiredSponsorCheckout(db, event, 40, null)
    const leads = await db.select().from(sponsorAbandonedCheckouts)
    expect(leads[0]?.email).toBe('link@example.com')
    expect(leads[0]?.source).toBe('payment_link')
    expect(leads[0]?.recoveryEmailSentAt).toBeNull()
    await close()
  })
})

describe('sponsor abandoned checkout migration', () => {
  it('is safe to re-run and adds columns onto a table that already exists', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-abandoned-'))
    directories.push(directory)
    const url = `file:${path.join(directory, 'abandoned.db')}`
    const client = createClient({ url })
    await client.execute(`CREATE TABLE sponsor_abandoned_checkouts (
      stripe_checkout_session_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      offering TEXT NOT NULL,
      expired_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`)
    await client.execute({
      sql: `INSERT INTO sponsor_abandoned_checkouts
        (stripe_checkout_session_id, email, offering, expired_at, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['cs_keep', 'keep@example.com', 'sponsor_monthly', 1, 'payment_link', 1],
    })
    client.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const names = (await again.execute('PRAGMA table_info(sponsor_abandoned_checkouts)')).rows.map((row) => String(row.name))
    expect(names).toEqual(
      expect.arrayContaining([
        'email',
        'offering',
        'expired_at',
        'task_slug',
        'source',
        'recovery_url',
        'recovery_email_claimed_at',
        'recovery_email_sent_at',
        'promotions_consent',
        'consented_at',
        'created_at',
      ]),
    )
    const dropped = await again.execute('SELECT email FROM sponsor_abandoned_checkouts')
    expect(dropped.rows).toEqual([])
    await again.execute({
      sql: `INSERT INTO sponsor_abandoned_checkouts
        (stripe_checkout_session_id, email, offering, expired_at, source, promotions_consent, consented_at, created_at)
        VALUES (?, ?, ?, ?, ?, 'opt_in', ?, ?)`,
      args: ['cs_opt_in', 'optin@example.com', 'sponsor_monthly', 2, 'payment_link', 2, 2],
    })
    again.close()
    await applyMigrations(url)
    const keptDb = createClient({ url })
    const kept = await keptDb.execute('SELECT email, promotions_consent FROM sponsor_abandoned_checkouts')
    expect(kept.rows).toEqual([{ email: 'optin@example.com', promotions_consent: 'opt_in' }])
    keptDb.close()
    const ledgerDb = createClient({ url })
    const ledger = await ledgerDb.execute(
      "SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '0026_sponsor_abandoned_checkouts.sql'",
    )
    expect(Number(ledger.rows[0]?.n)).toBe(1)
    ledgerDb.close()
  })
})

describe('abandoned checkout surfaces', () => {
  it('shows the leads on the sponsor admin page and names the Dashboard steps', () => {
    const admin = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsors/page.tsx'), 'utf8')
    const runbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/sponsor-payment-links.md'), 'utf8')
    expect(admin).toContain('Abandoned checkouts')
    expect(admin).toContain('listAbandonedSponsorCheckouts')
    expect(admin).toContain('One manual follow-up email is allowed')
    expect(admin).toContain('gets no follow-up email')
    expect(runbook).toContain('one manual email')
    expect(runbook).toContain('there is no follow-up email')
    expect(runbook).toContain('DATA_RETENTION_PRODUCTION_LAUNCH')
    expect(runbook).toContain('CRON_SECRET')
    expect(runbook).toContain('DATA_RETENTION_PURGE')
    expect(runbook).toContain('DATA_RETENTION_DRY_RUN')
    expect(runbook).toContain('Cancel at end of period')
    expect(runbook).toContain('checkout.session.expired')
    expect(runbook).toContain('plink_1URyeXIJUbygfAucnLlkSP5u')
    expect(runbook).toContain('consent_collection.promotions')
    expect(runbook).toContain('after_expiration.recovery')
    expect(runbook).toContain('needs Mark\'s OK')
    expect(runbook).toContain('Nov 1')
    expect(runbook).not.toMatch(/sk_(live|test)_|rk_(live|test)_|whsec_/)
  })
})
