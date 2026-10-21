import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SponsorForm } from '@/components/sponsor-form'
import { createTestDatabase } from '@/test/db'
import { sponsorshipCreatives, sponsorships, stripeEvents, subscriptions } from './db/schema'
import {
  SUBSCRIPTION_RENEWAL_GRACE_MS,
  activeBestPlacementForTask,
  placementActiveAt,
  placementEndsAt,
} from './best-placement'
import {
  FOUNDING_HOLD_MS,
  SPONSOR_CHECKOUT_EXPIRY_MS,
  SPONSOR_SLOT_TAKEN,
  FOUNDING_LINK_KEY_PREFIX,
  claimSponsorSlot,
  foundingSpotsLeft,
  foundingSpotsTaken,
  releaseSponsorSlot,
  sponsorHoldKey,
} from './sponsor-availability'
import { approvedSponsorRedirectUrl } from './sponsor-impressions'
import { parseSponsorCheckout, sponsorCheckoutParams } from './sponsor-checkout'
import {
  FOUNDING_PRICE_LOCK_MONTHS,
  FOUNDING_SOLD_OUT,
  FOUNDING_SPONSOR_CAP,
  FOUNDING_TRIAL_DAYS,
  SPONSOR_TASK_FIELD_LABEL,
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_INTEGRATION_IDENTIFIER,
  SPONSOR_ONE_TIME_NOTICE,
  SPONSOR_SUBSCRIPTION_NOTICE,
  isSubscriptionOffering,
  sponsorOffering,
  sponsorOfferingConfigured,
  sponsorOfferingNotice,
  sponsorOfferingPriceLabel,
  sponsorSetupPriceId,
} from './sponsor-offerings'
import { verifyPaidSponsorCheckout } from './sponsor-session'
import { SPONSOR_SUBSCRIPTION_WEBHOOK_EVENTS, addUtcMonths, handleStripeWebhook } from './stripe-webhook'

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const SECRET = 'whsec_test_secret'
const DAY = 24 * 60 * 60 * 1000
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const PRICE_ENV = {
  STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_e2e_weekly',
  STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_e2e_monthly',
  STRIPE_PRICE_NEWSLETTER_SLOT: 'price_e2e_newsletter',
  STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_e2e_subscription',
  STRIPE_PRICE_FOUNDING_MONTHLY: 'price_e2e_founding_monthly',
  STRIPE_PRICE_FOUNDING_SETUP: 'price_e2e_founding_setup',
} as const

const ORIGINAL_ENV = Object.fromEntries(Object.keys(PRICE_ENV).map((key) => [key, process.env[key]])) as Record<
  string,
  string | undefined
>

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe('subscription sponsor offerings', () => {
  it('lists the standard monthly subscription and the founding offer next to the one-time prices', () => {
    const subscription = sponsorOffering('placement_subscription')
    const founding = sponsorOffering('founding_sponsor')
    expect(subscription).toMatchObject({ billing: 'subscription', interval: 'month', unitAmount: 29_900, target: 'task' })
    expect(founding).toMatchObject({
      billing: 'subscription',
      interval: 'month',
      unitAmount: 29_900,
      trialDays: 14,
      priceLockMonths: 6,
      setup: { unitAmount: 9_900, priceEnv: 'STRIPE_PRICE_FOUNDING_SETUP' },
    })
    expect(FOUNDING_TRIAL_DAYS).toBe(14)
    expect(FOUNDING_PRICE_LOCK_MONTHS).toBe(6)
    if (!subscription || !founding) throw new Error('missing offering')
    expect(sponsorOfferingPriceLabel(subscription)).toBe('$299/mo')
    expect(sponsorOfferingPriceLabel(founding)).toBe('$99 for 2 weeks, then $299/mo')
    expect(sponsorOfferingNotice(subscription)).toBe(SPONSOR_SUBSCRIPTION_NOTICE)
    expect(sponsorOfferingNotice(founding)).toBe(SPONSOR_FOUNDING_NOTICE)
    expect(SPONSOR_FOUNDING_NOTICE).toContain('$99')
    expect(SPONSOR_FOUNDING_NOTICE).toContain('first 2 weeks')
    expect(SPONSOR_FOUNDING_NOTICE).toContain('$299 per month')
    // A price lock, not a commitment.
    expect(SPONSOR_FOUNDING_NOTICE).toContain('Founding price locked for 6 months. Cancel anytime.')
    expect(SPONSOR_FOUNDING_NOTICE).not.toMatch(/commit|after the first|minimum/i)
    expect(FOUNDING_SPONSOR_CAP).toBe(5)
    expect(SPONSOR_FOUNDING_NOTICE.length).toBeLessThanOrEqual(1200)
    expect(SPONSOR_SUBSCRIPTION_NOTICE).toContain('until you cancel')
    expect(isSubscriptionOffering('placement_monthly')).toBe(false)
    expect(isSubscriptionOffering('founding_sponsor')).toBe(true)
  })

  it('needs both founding prices before the founding offer is available', () => {
    expect(sponsorOfferingConfigured('founding_sponsor', PRICE_ENV)).toBe(true)
    expect(sponsorOfferingConfigured('founding_sponsor', { ...PRICE_ENV, STRIPE_PRICE_FOUNDING_SETUP: '' })).toBe(false)
    expect(sponsorOfferingConfigured('founding_sponsor', { ...PRICE_ENV, STRIPE_PRICE_FOUNDING_MONTHLY: 'nope' })).toBe(false)
    expect(sponsorOfferingConfigured('placement_subscription', PRICE_ENV)).toBe(true)
    expect(sponsorSetupPriceId('placement_subscription', PRICE_ENV)).toBeNull()
    expect(sponsorSetupPriceId('founding_sponsor', PRICE_ENV)).toBe('price_e2e_founding_setup')
  })

  it('shows each option with its own renewal terms', () => {
    const html = renderToStaticMarkup(
      createElement(SponsorForm, {
        offerings: [
          { id: 'placement_weekly', title: 'Week', summary: 'A week', priceLabel: '$99', notice: SPONSOR_ONE_TIME_NOTICE, target: 'task', available: true },
          {
            id: 'founding_sponsor',
            title: 'Founding sponsor',
            summary: 'Founding',
            priceLabel: '$99 for 2 weeks, then $299/mo',
            notice: SPONSOR_FOUNDING_NOTICE,
            target: 'task',
            available: true,
          },
        ],
        tasks: [{ slug: 'coding', name: 'Coding' }],
      }),
    )
    expect(html).toContain(SPONSOR_ONE_TIME_NOTICE)
    expect(html).toContain('$99 for 2 weeks, then $299/mo')
    expect(SPONSOR_TASK_FIELD_LABEL).toBe('Which /best page do you want to sponsor?')
    expect(html).toContain(`<label for="sponsor-task" class="font-semibold">${SPONSOR_TASK_FIELD_LABEL}</label>`)
    expect(html).toMatch(/<select id="sponsor-task" name="task_slug" required=""/)
    expect(html.match(/One-time payment, no auto-renewal/g)).toHaveLength(1)
  })
})

describe('subscription checkout params', () => {
  const urls = {
    successUrl: 'https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://bestbotfor.com/sponsor/cancel',
  }

  it('starts the founding offer as a subscription with the $99 setup line and a 14-day trial', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'founding_sponsor',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'coding',
        request_id: REQUEST_ID,
        amount: '1',
      }),
      PRICE_ENV,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.priceId).toBe('price_e2e_founding_monthly')
    expect(parsed.value.setupPriceId).toBe('price_e2e_founding_setup')
    const claimedAt = Date.UTC(2026, 9, 19, 14)
    expect(() => sponsorCheckoutParams({ ...parsed.value, creativeId: '7', ...urls })).toThrow('founding checkout needs its hold time')
    const built = sponsorCheckoutParams({ ...parsed.value, creativeId: '7', claimedAt, ...urls })
    const params = built.params
    expect(params.mode).toBe('subscription')
    // The session expires 60 minutes after the hold's claimed_at (Stripe's minimum is 30).
    expect(params.expires_at).toBe((claimedAt + 60 * 60 * 1000) / 1000)
    expect(params.line_items).toEqual([
      { price: 'price_e2e_founding_monthly', quantity: 1 },
      { price: 'price_e2e_founding_setup', quantity: 1 },
    ])
    expect(params.subscription_data?.trial_period_days).toBe(14)
    expect(params.subscription_data?.metadata).toMatchObject({
      kind: 'sponsorship',
      offering: 'founding_sponsor',
      task_slug: 'coding',
      creative_id: '7',
      price_lock_months: '6',
      trial_days: '14',
      setup_price_id: 'price_e2e_founding_setup',
    })
    expect(params.metadata).toMatchObject({ kind: 'sponsorship', offering: 'founding_sponsor', billing: 'subscription' })
    expect(params.payment_method_collection).toBe('always')
    expect((params.custom_text?.submit as { message?: string } | undefined)?.message).toBe(SPONSOR_FOUNDING_NOTICE)
    expect(params.integration_identifier).toBe(SPONSOR_INTEGRATION_IDENTIFIER)
    expect(params.managed_payments).toEqual({ enabled: false })
    expect(params).not.toHaveProperty('payment_intent_data')
    expect(params).not.toHaveProperty('automatic_tax')
    expect(JSON.stringify(params)).not.toContain('unit_amount')
    expect(JSON.stringify(params)).not.toContain('price_data')
    const again = sponsorCheckoutParams({ ...parsed.value, creativeId: '7', claimedAt, ...urls })
    expect(again).toEqual(built)
    expect(built.idempotencyKey).toMatch(new RegExp(`^sponsor-[0-9a-f]{16}-${REQUEST_ID}-h${claimedAt}$`))
    // A later hold (after this one lapsed) sends a different expires_at, so it gets a different key.
    const later = sponsorCheckoutParams({ ...parsed.value, creativeId: '7', claimedAt: claimedAt + 65 * 60 * 1000, ...urls })
    expect(later.idempotencyKey).not.toBe(built.idempotencyKey)
    expect(later.params.expires_at).not.toBe(params.expires_at)
  })

  it('starts the standard monthly subscription with one recurring line and no trial', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'placement_subscription',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'writing',
        request_id: REQUEST_ID,
      }),
      PRICE_ENV,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const { params } = sponsorCheckoutParams({ ...parsed.value, ...urls })
    expect(params.mode).toBe('subscription')
    expect(params.line_items).toEqual([{ price: 'price_e2e_subscription', quantity: 1 }])
    expect(params.subscription_data).not.toHaveProperty('trial_period_days')
    expect(params.subscription_data?.metadata).toMatchObject({ offering: 'placement_subscription', price_lock_months: '0' })
    expect((params.custom_text?.submit as { message?: string } | undefined)?.message).toBe(SPONSOR_SUBSCRIPTION_NOTICE)
  })

  it('keeps the one-time checkout unchanged', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'placement_monthly',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'writing',
        request_id: REQUEST_ID,
      }),
      PRICE_ENV,
    )
    if (!parsed.ok) throw new Error('parse failed')
    const { params } = sponsorCheckoutParams({ ...parsed.value, ...urls })
    expect(Object.keys(params)).toEqual([
      'mode',
      'customer_email',
      'line_items',
      'success_url',
      'cancel_url',
      'metadata',
      'payment_intent_data',
      'custom_text',
      'integration_identifier',
      'managed_payments',
    ])
    expect(params.mode).toBe('payment')
    expect((params.custom_text?.submit as { message?: string } | undefined)?.message).toBe(SPONSOR_ONE_TIME_NOTICE)
    expect(params.metadata).not.toHaveProperty('billing')
  })

  it('refuses the founding offer when the setup price is missing, and a subscription without a task', () => {
    const noSetup = parseSponsorCheckout(
      form({
        offering: 'founding_sponsor',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'coding',
        request_id: REQUEST_ID,
      }),
      { ...PRICE_ENV, STRIPE_PRICE_FOUNDING_SETUP: '' },
    )
    expect(noSetup).toEqual({ ok: false, message: 'That offering is not available yet.' })
    const noTask = parseSponsorCheckout(
      form({ offering: 'placement_subscription', email: 'sponsor@example.com', company: 'Example Tools', request_id: REQUEST_ID }),
      PRICE_ENV,
    )
    expect(noTask).toEqual({ ok: false, message: 'Choose a task page for this placement.' })
  })
})

describe('subscription success-page verification', () => {
  function stripeWith(session: Record<string, unknown>): Stripe {
    return { checkout: { sessions: { retrieve: async () => session } } } as unknown as Stripe
  }
  const base = {
    id: 'cs_test_founding',
    mode: 'subscription',
    payment_status: 'paid',
    metadata: { kind: 'sponsorship', offering: 'founding_sponsor', task_slug: 'coding' },
  }

  it('accepts a paid subscription session and refuses a mode mismatch or an unpaid one', async () => {
    await expect(verifyPaidSponsorCheckout(stripeWith(base), 'cs_test_founding')).resolves.toEqual({
      ok: true,
      checkout: { sessionId: 'cs_test_founding', offering: 'founding_sponsor', taskSlug: 'coding' },
    })
    const trialOnly = await verifyPaidSponsorCheckout(
      stripeWith({ ...base, payment_status: 'no_payment_required', metadata: { ...base.metadata, offering: 'placement_subscription' } }),
      'cs_test_founding',
    )
    expect(trialOnly.ok).toBe(true)
    expect((await verifyPaidSponsorCheckout(stripeWith({ ...base, mode: 'payment' }), 'cs_test_founding')).ok).toBe(false)
    expect((await verifyPaidSponsorCheckout(stripeWith({ ...base, payment_status: 'unpaid' }), 'cs_test_founding')).ok).toBe(false)
    const oneTimeAsSub = await verifyPaidSponsorCheckout(
      stripeWith({ ...base, metadata: { ...base.metadata, offering: 'placement_weekly' } }),
      'cs_test_founding',
    )
    expect(oneTimeAsSub.ok).toBe(false)
    const oneTimeNoPayment = await verifyPaidSponsorCheckout(
      stripeWith({ ...base, mode: 'payment', payment_status: 'no_payment_required', metadata: { ...base.metadata, offering: 'placement_weekly' } }),
      'cs_test_founding',
    )
    expect(oneTimeNoPayment.ok).toBe(false)
  })
})

describe('addUtcMonths', () => {
  it('adds calendar months and clamps to the month end', () => {
    expect(new Date(addUtcMonths(Date.UTC(2026, 9, 18, 12), 6)).toISOString()).toBe('2027-04-18T12:00:00.000Z')
    expect(new Date(addUtcMonths(Date.UTC(2026, 7, 31), 6)).toISOString()).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('subscription placement window', () => {
  const start = Date.UTC(2026, 9, 18)
  const through = start + 14 * DAY

  it('runs from paidAt to paidThrough, plus the renewal grace only while renewing', () => {
    const row = { offering: 'founding_sponsor', paidAt: start, paidThrough: through, subscriptionStatus: 'trialing', cancelAt: null, canceledAt: null }
    expect(placementEndsAt(row)).toBe(through + SUBSCRIPTION_RENEWAL_GRACE_MS)
    expect(placementActiveAt(row, through + DAY)).toBe(true)
    expect(placementActiveAt(row, through + SUBSCRIPTION_RENEWAL_GRACE_MS)).toBe(false)
    expect(placementEndsAt({ ...row, subscriptionStatus: 'past_due' })).toBe(through)
    expect(placementEndsAt({ ...row, cancelAt: through })).toBe(through)
    expect(placementEndsAt({ ...row, subscriptionStatus: 'canceled', canceledAt: start + DAY })).toBe(through)
    expect(placementActiveAt({ ...row, subscriptionStatus: 'canceled', canceledAt: start + DAY }, through + 1)).toBe(false)
    expect(placementEndsAt({ ...row, paidThrough: null })).toBeNull()
    expect(placementActiveAt(row, start - 1)).toBe(false)
    // One-time rows keep their fixed windows.
    expect(placementEndsAt({ offering: 'placement_weekly', paidAt: start })).toBe(start + 7 * DAY)
    expect(placementEndsAt({ offering: 'newsletter_slot', paidAt: start })).toBeNull()
  })
})

describe('subscription slot claims', () => {
  const NOW = Date.UTC(2026, 9, 18)

  async function seed(values: Partial<typeof sponsorships.$inferInsert>) {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_sub',
      offering: 'founding_sponsor',
      status: 'paid',
      taskSlug: 'coding',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
      stripeSubscriptionId: 'sub_sponsor',
      subscriptionStatus: 'trialing',
      paidThrough: NOW + 14 * DAY,
      ...values,
    })
    return { db, close }
  }

  it('holds the task open-ended while a subscription renews', async () => {
    const { db, close } = await seed({})
    const later = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-a', now: NOW + 200 * DAY })
    expect(later).toEqual({ ok: false, message: SPONSOR_SLOT_TAKEN })
    const otherTask = await claimSponsorSlot(db, { taskSlug: 'writing', offering: 'founding_sponsor', requestKey: 'req-b', now: NOW + DAY })
    expect(otherTask).toMatchObject({ ok: true })
    await close()
  })

  it('frees the task after a canceled or cancel-scheduled subscription reaches paid_through', async () => {
    const { db, close } = await seed({ subscriptionStatus: 'active', cancelAt: NOW + 14 * DAY })
    const during = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-a', now: NOW + DAY })
    expect(during.ok).toBe(false)
    const after = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_weekly', requestKey: 'req-b', now: NOW + 14 * DAY })
    expect(after).toMatchObject({ ok: true })
    await close()
  })

  it('refuses a new subscription while a one-time placement is still running, and allows it after', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_week',
      offering: 'placement_weekly',
      status: 'paid',
      taskSlug: 'coding',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
    })
    const blocked = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_subscription', requestKey: 'req-a', now: NOW + 6 * DAY })
    expect(blocked.ok).toBe(false)
    const open = await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'placement_subscription', requestKey: 'req-b', now: NOW + 7 * DAY })
    expect(open).toMatchObject({ ok: true })
    await close()
  })
})

describe('founding sponsor cap', () => {
  const NOW = Date.UTC(2026, 9, 18)
  const TASKS = ['coding', 'writing', 'image', 'video', 'voice', 'music', 'research']

  it('allows 5 founding sponsors, counts live holds once, and frees a hold that expires or is released', async () => {
    const { db, close } = await createTestDatabase()
    expect(await foundingSpotsLeft(db, NOW)).toBe(5)
    // Two paid founding sponsors.
    for (const [index, task] of TASKS.slice(0, 2).entries()) {
      await db.insert(sponsorships).values({
        stripeCheckoutSessionId: `cs_paid_${index}`,
        offering: 'founding_sponsor',
        status: 'paid',
        taskSlug: task,
        createdAt: NOW,
        updatedAt: NOW,
        paidAt: NOW,
        stripeSubscriptionId: `sub_${index}`,
        subscriptionStatus: 'trialing',
        paidThrough: NOW + 14 * DAY,
      })
    }
    // A paid row whose own hold is still live counts once.
    await db.$client.execute({
      sql: 'INSERT INTO sponsorship_slot_claims (task_slug, request_key, offering, claimed_at) VALUES (?, ?, ?, ?)',
      args: [TASKS[0] ?? '', 'req-paid-0', 'founding_sponsor', NOW],
    })
    expect(await foundingSpotsLeft(db, NOW + 1)).toBe(3)
    // Three more checkouts hold the last three spots.
    for (const task of TASKS.slice(2, 5)) {
      expect(await claimSponsorSlot(db, { taskSlug: task, offering: 'founding_sponsor', requestKey: `req-${task}`, now: NOW + 2 })).toMatchObject({ ok: true })
    }
    expect(await foundingSpotsLeft(db, NOW + 3)).toBe(0)
    // A sixth is refused as sold out, and a retry of a held checkout still works.
    expect(await claimSponsorSlot(db, { taskSlug: TASKS[5] ?? '', offering: 'founding_sponsor', requestKey: 'req-6', now: NOW + 4 })).toEqual({
      ok: false,
      message: FOUNDING_SOLD_OUT,
    })
    expect(await claimSponsorSlot(db, { taskSlug: TASKS[2] ?? '', offering: 'founding_sponsor', requestKey: `req-${TASKS[2]}`, now: NOW + 5 })).toMatchObject({ ok: true })
    // The standard subscription is not capped.
    expect(await claimSponsorSlot(db, { taskSlug: TASKS[5] ?? '', offering: 'placement_subscription', requestKey: 'req-sub', now: NOW + 6 })).toMatchObject({ ok: true })
    // A released hold frees its spot.
    await releaseSponsorSlot(db, { taskSlug: TASKS[3] ?? '', requestKey: sponsorHoldKey({ requestKey: `req-${TASKS[3]}`, offering: 'founding_sponsor' }) })
    expect(await claimSponsorSlot(db, { taskSlug: TASKS[6] ?? '', offering: 'founding_sponsor', requestKey: 'req-7', now: NOW + 7 })).toMatchObject({ ok: true })
    // An expired hold frees its spot too: a founding hold counts for 65 minutes, not 24 hours.
    expect(await foundingSpotsLeft(db, NOW + 1 + FOUNDING_HOLD_MS)).toBe(0)
    expect(await foundingSpotsLeft(db, NOW + 7 + FOUNDING_HOLD_MS)).toBe(3)
    expect(SPONSOR_CHECKOUT_EXPIRY_MS).toBe(24 * 60 * 60 * 1000)
    await close()
  })

  it('keeps counting a canceled founding sponsor and frees a refunded one', async () => {
    const { db, close } = await createTestDatabase()
    for (const [index, task] of TASKS.slice(0, 5).entries()) {
      await db.insert(sponsorships).values({
        stripeCheckoutSessionId: `cs_${index}`,
        offering: 'founding_sponsor',
        status: 'paid',
        taskSlug: task,
        createdAt: NOW,
        updatedAt: NOW,
        paidAt: NOW,
        subscriptionStatus: index === 0 ? 'canceled' : 'active',
        canceledAt: index === 0 ? NOW + DAY : null,
        paidThrough: NOW + DAY,
        refundedAt: index === 1 ? NOW + DAY : null,
      })
    }
    expect(await foundingSpotsLeft(db, NOW + 2 * DAY)).toBe(1)
    await close()
  })

  it('Sentinel QA81 BYPASS: a new founding hold on a canceled, ended founder\'s page still counts, so a sixth is refused', async () => {
    const { db, close } = await createTestDatabase()
    const T = NOW + 60 * DAY
    for (const [index, task] of TASKS.slice(0, 4).entries()) {
      await db.insert(sponsorships).values({
        stripeCheckoutSessionId: `cs_bypass_${index}`,
        offering: 'founding_sponsor',
        status: 'paid',
        taskSlug: task,
        createdAt: NOW,
        updatedAt: NOW,
        paidAt: NOW,
        stripeSubscriptionId: `sub_bypass_${index}`,
        subscriptionStatus: index === 0 ? 'canceled' : 'active',
        canceledAt: index === 0 ? T - 20 * DAY : null,
        paidThrough: index === 0 ? T - 10 * DAY : T + 10 * DAY,
      })
    }
    expect(await foundingSpotsTaken(db, T)).toBe(4)
    // Buyer A holds the freed coding page: the 5th spot.
    expect(await claimSponsorSlot(db, { taskSlug: 'coding', offering: 'founding_sponsor', requestKey: 'req-A', now: T })).toMatchObject({ ok: true })
    expect(await foundingSpotsTaken(db, T + 1)).toBe(5)
    // Buyer B on another page is refused.
    expect(await claimSponsorSlot(db, { taskSlug: 'voice', offering: 'founding_sponsor', requestKey: 'req-B', now: T + 2 })).toEqual({
      ok: false,
      message: FOUNDING_SOLD_OUT,
    })
    await close()
  })

  it('counts a founding link sale only while its first-period row is unrefunded, and never from renewal rows alone', async () => {
    const { db, close } = await createTestDatabase()
    const row = (key: string, extra: Record<string, unknown> = {}) =>
      db.insert(sponsorships).values({
        stripeCheckoutSessionId: key,
        stripePaymentIntentId: `pi_${key.replace(/[^a-z0-9]/gi, '_')}`,
        offering: 'placement_monthly',
        status: 'paid',
        taskSlug: 'coding',
        createdAt: NOW,
        updatedAt: NOW,
        paidAt: NOW,
        ...extra,
      })
    // First period refunded, then a renewal row written later: the sale stays freed.
    await row('founding_link:cs_r', { refundedAt: NOW + DAY })
    await row('founding_link:cs_r:in_2', { paidAt: NOW + 30 * DAY })
    expect(await foundingSpotsTaken(db, NOW + 31 * DAY)).toBe(0)
    // A renewal row with no first-period row does not count.
    await row('founding_link:cs_orphan:in_9', { taskSlug: 'writing' })
    // Typos with no first-period sale id do not count either.
    await row('founding_link:', { taskSlug: 'image' })
    await row('founding_link::in_7', { taskSlug: 'image' })
    expect(await foundingSpotsTaken(db, NOW + 31 * DAY)).toBe(0)
    // Case, surrounding spaces, and a hyphen still count.
    await row('  Founding_Link:cs_case  ', { taskSlug: 'video' })
    await row('founding-link:cs_dash', { taskSlug: 'voice' })
    expect(await foundingSpotsTaken(db, NOW + 31 * DAY)).toBe(2)
    await close()
  })

  it('shares one cap of 5 with founding Payment Link sales recorded as manual rows', async () => {
    const { db, close } = await createTestDatabase()
    const manual = (key: string, task: string, offering: 'placement_weekly' | 'placement_monthly', extra: Record<string, unknown> = {}) =>
      db.insert(sponsorships).values({
        stripeCheckoutSessionId: key,
        stripePaymentIntentId: `pi_${key.replace(/[^a-z0-9]/gi, '_')}`,
        offering,
        status: 'paid',
        taskSlug: task,
        createdAt: NOW,
        updatedAt: NOW,
        paidAt: NOW,
        ...extra,
      })
    // Founding link sale 1: two periods (first period plus one renewal) count once.
    await manual(`${FOUNDING_LINK_KEY_PREFIX}cs_link_1`, 'coding', 'placement_monthly')
    await manual(`${FOUNDING_LINK_KEY_PREFIX}cs_link_1:in_2`, 'coding', 'placement_monthly', { paidAt: NOW + 30 * DAY })
    // Founding link sale 2: a renewal refunded, first period still paid, so it counts.
    await manual(` ${FOUNDING_LINK_KEY_PREFIX.toUpperCase()}cs_link_2 `, 'writing', 'placement_weekly')
    await manual(`${FOUNDING_LINK_KEY_PREFIX}cs_link_2:in_3`, 'writing', 'placement_monthly', { paidAt: NOW + 14 * DAY, refundedAt: NOW + 20 * DAY })
    // Founding link sale 3: fully refunded, so its spot is free.
    await manual(`${FOUNDING_LINK_KEY_PREFIX}cs_link_3`, 'image', 'placement_monthly', { refundedAt: NOW + DAY })
    // Monthly Payment Link and one-time /sponsor rows are not founding.
    await manual('cs_monthly_link', 'video', 'placement_monthly')
    await manual('cs_one_time', 'music', 'placement_weekly')
    // One app founding sponsor.
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_app_founding',
      offering: 'founding_sponsor',
      status: 'paid',
      taskSlug: 'research',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
      stripeSubscriptionId: 'sub_app_founding',
      subscriptionStatus: 'active',
      paidThrough: NOW + 40 * DAY,
    })
    const T = NOW + 40 * DAY
    expect(await foundingSpotsTaken(db, T)).toBe(3)
    expect(await foundingSpotsLeft(db, T)).toBe(2)
    expect(await claimSponsorSlot(db, { taskSlug: 'voice', offering: 'founding_sponsor', requestKey: 'req-1', now: T })).toMatchObject({ ok: true })
    expect(await claimSponsorSlot(db, { taskSlug: 'meetings', offering: 'founding_sponsor', requestKey: 'req-2', now: T })).toMatchObject({ ok: true })
    expect(await claimSponsorSlot(db, { taskSlug: 'chat', offering: 'founding_sponsor', requestKey: 'req-3', now: T })).toEqual({
      ok: false,
      message: FOUNDING_SOLD_OUT,
    })
    await close()
  })
})

type StubState = {
  lineItems: Array<{ price: string; quantity: number }>
  subscription: Record<string, unknown>
  sessionSubscription?: string | null
  /** Invoice id each payment intent paid (InvoicePayment lookup). */
  invoiceByIntent?: Record<string, string>
  /** Subscription each invoice belongs to. */
  invoiceSubscription?: Record<string, string>
  /** Customer on each charge. */
  chargeCustomer?: Record<string, string>
  calls?: string[]
}

function webhookStripe(events: Stripe.Event[], state: StubState): Stripe {
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
        async retrieve(id: string) {
          return {
            id,
            subscription: state.sessionSubscription ?? 'sub_sponsor',
            line_items: { data: state.lineItems.map((item) => ({ price: { id: item.price }, quantity: item.quantity })) },
          }
        },
      },
    },
    subscriptions: {
      async retrieve(id: string) {
        return { id, ...state.subscription }
      },
    },
    invoicePayments: {
      async list(params: { payment?: { type: string; payment_intent?: string }; expand?: string[] }) {
        state.calls?.push(`invoicePayments.list:${params.payment?.payment_intent}`)
        const invoice = params.payment?.payment_intent ? state.invoiceByIntent?.[params.payment.payment_intent] : undefined
        return { data: invoice ? [{ id: `inpay_${invoice}`, invoice }] : [] }
      },
    },
    invoices: {
      async retrieve(id: string) {
        state.calls?.push(`invoices.retrieve:${id}`)
        const subscription = state.invoiceSubscription?.[id]
        return {
          id,
          parent: subscription ? { type: 'subscription_details', subscription_details: { subscription } } : null,
        }
      },
    },
    charges: {
      async retrieve(id: string) {
        state.calls?.push(`charges.retrieve:${id}`)
        return { id, customer: state.chargeCustomer?.[id] ?? null }
      },
    },
  } as unknown as Stripe
}

const T0 = Date.UTC(2026, 9, 18, 18) // Oct 18, 2026 2:00 PM ET
const T0S = T0 / 1000
const TRIAL_END_S = T0S + 14 * 86_400
const RENEW_END_S = TRIAL_END_S + 30 * 86_400

function foundingSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'trialing',
    start_date: T0S,
    trial_end: TRIAL_END_S,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    metadata: { kind: 'sponsorship', offering: 'founding_sponsor', task_slug: 'coding' },
    items: { data: [{ price: { id: 'price_e2e_founding_monthly' }, quantity: 1, current_period_end: TRIAL_END_S }] },
    ...overrides,
  }
}

function checkoutCompleted(id: string, overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id,
    type: 'checkout.session.completed',
    created: T0S,
    livemode: false,
    data: {
      object: {
        id: 'cs_test_founding',
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_sponsor',
        customer: 'cus_sponsor',
        payment_intent: null,
        customer_email: 'sponsor@example.com',
        amount_total: 9_900,
        currency: 'usd',
        metadata: {
          kind: 'sponsorship',
          offering: 'founding_sponsor',
          email: 'sponsor@example.com',
          company: 'Example Tools',
          task_slug: 'coding',
          issue_date: '',
          price_id: 'price_e2e_founding_monthly',
          creative_id: '',
        },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event
}

function invoiceEvent(id: string, type: 'invoice.paid' | 'invoice.payment_failed', periodEndS: number, created = T0S): Stripe.Event {
  return {
    id,
    type,
    created,
    livemode: false,
    data: {
      object: {
        id: `in_${id}`,
        parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_sponsor', metadata: { kind: 'sponsorship' } } },
        lines: { data: [{ period: { start: periodEndS - 30 * 86_400, end: periodEndS } }] },
      },
    },
  } as unknown as Stripe.Event
}

function subscriptionChange(
  id: string,
  type: 'customer.subscription.updated' | 'customer.subscription.deleted',
  created: number,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id,
    type,
    created,
    livemode: false,
    data: { object: { id: 'sub_sponsor', customer: 'cus_sponsor', ...foundingSubscription(overrides) } },
  } as unknown as Stripe.Event
}

describe('sponsor subscription webhook', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(PRICE_ENV)) process.env[key] = value
  })
  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const foundingLines = [
    { price: 'price_e2e_founding_monthly', quantity: 1 },
    { price: 'price_e2e_founding_setup', quantity: 1 },
  ]

  async function send(db: Awaited<ReturnType<typeof createTestDatabase>>['db'], stripe: Stripe, event: Stripe.Event, now: number) {
    return handleStripeWebhook({ rawBody: JSON.stringify(event), signature: 'valid', db, stripe, secret: SECRET, now })
  }

  it('lists the events the live endpoint needs', () => {
    expect([...SPONSOR_SUBSCRIPTION_WEBHOOK_EVENTS]).toEqual([
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ])
  })

  it('records a founding checkout once, through the trial, with the 6-month lock, and links the card', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorshipCreatives).values({
      requestKey: 'req-founding',
      status: 'pending',
      toolName: 'Widget',
      description: 'A useful coding tool.',
      url: 'https://example.com/widget',
      logoMime: 'image/png',
      logoBytes: PNG,
      createdAt: T0,
      updatedAt: T0,
    } as typeof sponsorshipCreatives.$inferInsert)
    const creative = (await db.select().from(sponsorshipCreatives))[0]
    const event = checkoutCompleted('evt_founding', {
      metadata: { ...(checkoutCompleted('x').data.object as { metadata: Record<string, string> }).metadata, creative_id: String(creative?.id) },
    })
    const stripe = webhookStripe([event], { lineItems: foundingLines, subscription: foundingSubscription() })
    expect(await send(db, stripe, event, T0)).toEqual({ status: 200, body: { received: true } })
    expect(await send(db, stripe, event, T0 + 1)).toEqual({ status: 200, body: { received: true, duplicate: true } })
    const rows = await db.select().from(sponsorships)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      stripeCheckoutSessionId: 'cs_test_founding',
      stripeSubscriptionId: 'sub_sponsor',
      stripePaymentIntentId: null,
      stripePriceId: 'price_e2e_founding_monthly',
      offering: 'founding_sponsor',
      status: 'paid',
      paidAt: T0,
      paidThrough: TRIAL_END_S * 1000,
      subscriptionStatus: 'trialing',
      priceLockedUntil: Date.UTC(2027, 3, 18, 18),
      cancelAt: null,
      canceledAt: null,
      amountTotal: 9_900,
      taskSlug: 'coding',
    })
    const linked = await db.select().from(sponsorshipCreatives)
    expect(linked[0]?.sponsorshipId).toBe(rows[0]?.id)
    // Sponsor subscriptions are not memberships.
    expect(await db.select().from(subscriptions)).toEqual([])
    await close()
  })

  it('refuses a session whose prices do not match the server prices and leaves no row', async () => {
    const { db, close } = await createTestDatabase()
    const event = checkoutCompleted('evt_bad_price')
    for (const lineItems of [
      [{ price: 'price_e2e_founding_monthly', quantity: 1 }],
      [
        { price: 'price_e2e_founding_monthly', quantity: 1 },
        { price: 'price_attacker', quantity: 1 },
      ],
      [
        { price: 'price_e2e_founding_monthly', quantity: 2 },
        { price: 'price_e2e_founding_setup', quantity: 1 },
      ],
    ]) {
      const stripe = webhookStripe([event], { lineItems, subscription: foundingSubscription() })
      await expect(send(db, stripe, event, T0)).rejects.toThrow(/sponsorship (price|quantity) mismatch/)
    }
    const wrongSub = webhookStripe([event], {
      lineItems: foundingLines,
      subscription: foundingSubscription({ metadata: { kind: 'sponsorship', offering: 'placement_subscription' } }),
    })
    await expect(send(db, wrongSub, event, T0)).rejects.toThrow('sponsorship subscription mismatch')
    expect(await db.select().from(sponsorships)).toEqual([])
    expect(await db.select().from(stripeEvents)).toEqual([])
    await close()
  })

  it('extends paid_through on each renewal, ignores a replay, and records then clears a failure', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_c')
    const renewal = invoiceEvent('evt_renew', 'invoice.paid', RENEW_END_S, TRIAL_END_S)
    const failed = invoiceEvent('evt_fail', 'invoice.payment_failed', RENEW_END_S + 30 * 86_400, RENEW_END_S)
    const recovered = invoiceEvent('evt_recover', 'invoice.paid', RENEW_END_S + 30 * 86_400, RENEW_END_S + 86_400)
    const stale = invoiceEvent('evt_stale', 'invoice.paid', TRIAL_END_S, T0S)
    const stripe = webhookStripe([completed, renewal, failed, recovered, stale], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
    })
    await send(db, stripe, completed, T0)
    await send(db, stripe, renewal, TRIAL_END_S * 1000)
    await send(db, stripe, renewal, TRIAL_END_S * 1000 + 5)
    let row = (await db.select().from(sponsorships))[0]
    expect(row?.paidThrough).toBe(RENEW_END_S * 1000)
    expect(row?.paidAt).toBe(T0)

    await send(db, stripe, failed, RENEW_END_S * 1000)
    row = (await db.select().from(sponsorships))[0]
    expect(row?.paymentFailedAt).toBe(RENEW_END_S * 1000)
    expect(row?.subscriptionStatus).toBe('past_due')
    expect(row?.paidThrough).toBe(RENEW_END_S * 1000)
    expect(row && placementActiveAt(row, RENEW_END_S * 1000 + 1)).toBe(false)

    await send(db, stripe, recovered, RENEW_END_S * 1000 + DAY)
    await send(db, stripe, stale, RENEW_END_S * 1000 + DAY + 1)
    row = (await db.select().from(sponsorships))[0]
    expect(row?.paymentFailedAt).toBeNull()
    expect(row?.subscriptionStatus).toBe('active')
    expect(row?.paidThrough).toBe((RENEW_END_S + 30 * 86_400) * 1000)
    await close()
  })

  it('handles invoice.paid arriving before checkout.session.completed', async () => {
    const { db, close } = await createTestDatabase()
    const first = invoiceEvent('evt_first_invoice', 'invoice.paid', TRIAL_END_S)
    const completed = checkoutCompleted('evt_late_checkout')
    const stripe = webhookStripe([first, completed], { lineItems: foundingLines, subscription: foundingSubscription() })
    expect(await send(db, stripe, first, T0)).toEqual({ status: 200, body: { received: true } })
    expect(await db.select().from(sponsorships)).toEqual([])
    await send(db, stripe, completed, T0 + 10)
    const row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({ status: 'paid', paidThrough: TRIAL_END_S * 1000 })
    await close()
  })

  it('keeps a cancel at period end to the paid month, ends an immediate cancel now, and ignores older updates', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_c2')
    const scheduled = subscriptionChange('evt_sched', 'customer.subscription.updated', T0S + 86_400, {
      cancel_at_period_end: true,
      cancel_at: TRIAL_END_S,
    })
    const older = subscriptionChange('evt_older', 'customer.subscription.updated', T0S + 3_600, { status: 'trialing' })
    const deleted = subscriptionChange('evt_deleted', 'customer.subscription.deleted', T0S + 2 * 86_400, {
      status: 'canceled',
      canceled_at: T0S + 2 * 86_400,
      ended_at: T0S + 2 * 86_400,
    })
    const revive = subscriptionChange('evt_revive', 'customer.subscription.updated', T0S + 3 * 86_400, { status: 'active' })
    const stripe = webhookStripe([completed, scheduled, older, deleted, revive], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
    })
    await send(db, stripe, completed, T0)
    await send(db, stripe, scheduled, T0 + DAY)
    let row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({ cancelAt: TRIAL_END_S * 1000, subscriptionStatus: 'trialing' })
    expect(row && placementEndsAt(row)).toBe(TRIAL_END_S * 1000)

    await send(db, stripe, older, T0 + DAY + 1)
    row = (await db.select().from(sponsorships))[0]
    expect(row?.cancelAt).toBe(TRIAL_END_S * 1000)

    await send(db, stripe, deleted, T0 + 2 * DAY)
    row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({
      subscriptionStatus: 'canceled',
      canceledAt: (T0S + 2 * 86_400) * 1000,
      paidThrough: (T0S + 2 * 86_400) * 1000,
    })
    expect(row && placementActiveAt(row, T0 + 2 * DAY + 1)).toBe(false)

    await send(db, stripe, revive, T0 + 3 * DAY)
    row = (await db.select().from(sponsorships))[0]
    expect(row?.subscriptionStatus).toBe('canceled')
    await close()
  })

  it('shows an approved founding card on /best through the trial and hides it after the subscription ends', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_c3')
    const stripe = webhookStripe([completed], { lineItems: foundingLines, subscription: foundingSubscription() })
    await send(db, stripe, completed, T0)
    const row = (await db.select().from(sponsorships))[0]
    if (!row) throw new Error('missing row')
    await db.insert(sponsorshipCreatives).values({
      requestKey: 'req-card',
      sponsorshipId: row.id,
      stripeCheckoutSessionId: row.stripeCheckoutSessionId,
      status: 'approved',
      toolName: 'Widget',
      description: 'A useful coding tool.',
      url: 'https://example.com/widget',
      logoMime: 'image/png',
      logoBytes: PNG,
      approvedToolName: 'Widget',
      approvedDescription: 'A useful coding tool.',
      approvedUrl: 'https://example.com/widget',
      approvedLogoMime: 'image/png',
      approvedLogoBytes: PNG,
      createdAt: T0,
      updatedAt: T0,
    } as typeof sponsorshipCreatives.$inferInsert)
    const during = await activeBestPlacementForTask(db, 'coding', T0 + 13 * DAY)
    expect(during).toMatchObject({ offering: 'founding_sponsor', sponsorshipId: row.id, label: 'Sponsored' })
    await expect(approvedSponsorRedirectUrl(db, row.id, T0 + 13 * DAY)).resolves.toBe('https://example.com/widget')
    await expect(approvedSponsorRedirectUrl(db, row.id, TRIAL_END_S * 1000 + SUBSCRIPTION_RENEWAL_GRACE_MS)).resolves.toBeNull()
    await db.update(sponsorships).set({ subscriptionStatus: 'canceled', canceledAt: T0 + DAY }).where(eq(sponsorships.id, row.id))
    expect(await activeBestPlacementForTask(db, 'coding', TRIAL_END_S * 1000 + 1)).toBeNull()
    await close()
  })

  it('does not set a trialing membership back to incomplete when checkout.session.completed arrives after subscription.created', async () => {
    const { db, close } = await createTestDatabase()
    const created = {
      id: 'evt_member_created',
      type: 'customer.subscription.created',
      created: T0S,
      livemode: false,
      data: {
        object: {
          id: 'sub_member_trial',
          customer: 'cus_member',
          status: 'trialing',
          metadata: { clerkUserId: 'user_9' },
          items: { data: [{ price: { id: 'price_member' }, current_period_end: TRIAL_END_S }] },
        },
      },
    } as unknown as Stripe.Event
    const completed = {
      id: 'evt_member_checkout',
      type: 'checkout.session.completed',
      created: T0S,
      livemode: false,
      data: {
        object: { id: 'cs_member', mode: 'subscription', subscription: 'sub_member_trial', customer: 'cus_member', metadata: { clerkUserId: 'user_9' } },
      },
    } as unknown as Stripe.Event
    const asyncPaid = { ...completed, id: 'evt_member_async', type: 'checkout.session.async_payment_succeeded' } as Stripe.Event
    const stripe = webhookStripe([created, completed, asyncPaid], { lineItems: [], subscription: {} })
    await send(db, stripe, created, T0)
    await send(db, stripe, completed, T0 + 1)
    let rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_member_trial'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'trialing', clerkUserId: 'user_9', stripePriceId: 'price_member' })
    await send(db, stripe, asyncPaid, T0 + 2)
    rows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, 'sub_member_trial'))
    expect(rows[0]?.status).toBe('trialing')

    // In the usual order the checkout seeds incomplete and the subscription event replaces it.
    const { db: db2, close: close2 } = await createTestDatabase()
    await send(db2, stripe, completed, T0)
    expect((await db2.select().from(subscriptions))[0]?.status).toBe('incomplete')
    await send(db2, stripe, created, T0 + 1)
    expect((await db2.select().from(subscriptions))[0]?.status).toBe('trialing')
    await close2()
    await close()
  })

  it('leaves membership subscription events on the membership table', async () => {
    const { db, close } = await createTestDatabase()
    const event = {
      id: 'evt_member',
      type: 'customer.subscription.updated',
      created: T0S,
      livemode: false,
      data: {
        object: {
          id: 'sub_member',
          customer: 'cus_member',
          status: 'active',
          metadata: { clerkUserId: 'user_1' },
          items: { data: [{ price: { id: 'price_member' }, current_period_end: RENEW_END_S }] },
        },
      },
    } as unknown as Stripe.Event
    const stripe = webhookStripe([event], { lineItems: [], subscription: {} })
    await send(db, stripe, event, T0)
    expect(await db.select().from(subscriptions)).toHaveLength(1)
    expect(await db.select().from(sponsorships)).toEqual([])
    const invoice = invoiceEvent('evt_member_invoice', 'invoice.paid', RENEW_END_S)
    const stripe2 = webhookStripe([invoice], { lineItems: [], subscription: {} })
    expect(await send(db, stripe2, invoice, T0)).toEqual({ status: 200, body: { received: true } })
    await close()
  })

  it('rejects a live-mode subscription event when live billing is off', async () => {
    const { db, close } = await createTestDatabase()
    const event = { ...invoiceEvent('evt_live_invoice', 'invoice.paid', RENEW_END_S), livemode: true } as Stripe.Event
    const stripe = webhookStripe([event], { lineItems: [], subscription: {} })
    const result = await handleStripeWebhook({
      rawBody: JSON.stringify(event),
      signature: 'valid',
      db,
      stripe,
      secret: SECRET,
      allowLive: false,
    })
    expect(result).toEqual({ status: 400, body: { error: 'live-mode-rejected' } })
    await close()
  })

  function refundEvent(id: string, type: 'charge.refunded' | 'refund.updated', object: Record<string, unknown>): Stripe.Event {
    return { id, type, created: T0S + 86_400, livemode: false, data: { object } } as unknown as Stripe.Event
  }

  it('sets refunded_at on a subscription sponsorship through the refunded invoice, via the real handler', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_refund_checkout')
    const chargeRefund = refundEvent('evt_charge_refunded', 'charge.refunded', {
      id: 'ch_first',
      object: 'charge',
      refunded: true,
      amount_refunded: 9_900,
      payment_intent: 'pi_first_invoice',
      customer: 'cus_sponsor',
    })
    const calls: string[] = []
    const stripe = webhookStripe([completed, chargeRefund], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
      invoiceByIntent: { pi_first_invoice: 'in_first' },
      invoiceSubscription: { in_first: 'sub_sponsor' },
      calls,
    })
    await send(db, stripe, completed, T0)
    let row = (await db.select().from(sponsorships))[0]
    // Checkout stores no payment intent for mode=subscription.
    expect(row?.stripePaymentIntentId).toBeNull()
    expect(row && placementActiveAt(row, T0 + DAY)).toBe(true)

    expect(await send(db, stripe, chargeRefund, T0 + DAY)).toEqual({ status: 200, body: { received: true } })
    row = (await db.select().from(sponsorships))[0]
    expect(row?.refundedAt).toBe(T0 + DAY)
    expect(calls).toEqual(['invoicePayments.list:pi_first_invoice', 'invoices.retrieve:in_first'])
    expect(await activeBestPlacementForTask(db, 'coding', T0 + DAY + 1)).toBeNull()
    await close()
  })

  it('never matches an invoice-less refund on the customer: it changes nothing and logs it for manual handling', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_refund_checkout_2')
    const refund = refundEvent('evt_refund_updated', 'refund.updated', {
      id: 're_1',
      object: 'refund',
      status: 'succeeded',
      charge: 'ch_no_invoice',
      payment_intent: 'pi_no_invoice',
    })
    const calls: string[] = []
    const stripe = webhookStripe([completed, refund], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
      chargeCustomer: { ch_no_invoice: 'cus_sponsor' },
      calls,
    })
    await send(db, stripe, completed, T0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await send(db, stripe, refund, T0 + DAY)).toEqual({ status: 200, body: { received: true } })
      expect(warn).toHaveBeenCalledWith('stripe-webhook: unmatched sponsor refund, manual handling needed', {
        eventType: 'refund.updated',
        reason: 'no_invoice',
      })
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/cus_|ch_|pi_|@/)
    } finally {
      warn.mockRestore()
    }
    const row = (await db.select().from(sponsorships))[0]
    expect(row?.refundedAt).toBeNull()
    expect(calls.some((call) => call.startsWith('charges.retrieve'))).toBe(false)
    expect(row && placementActiveAt(row, T0 + DAY + 1)).toBe(true)
    await close()
  })

  it('Sentinel QA81 AMBIGUOUS: refunding an invoice-less custom-deal charge on a sponsor customer keeps the subscription placement', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_refund_checkout_custom')
    const refund = refundEvent('evt_custom_deal_refund', 'charge.refunded', {
      id: 'ch_custom_deal',
      refunded: true,
      amount_refunded: 5_000,
      payment_intent: 'pi_custom_deal',
      customer: 'cus_sponsor',
    })
    const stripe = webhookStripe([completed, refund], { lineItems: foundingLines, subscription: foundingSubscription() })
    await send(db, stripe, completed, T0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await send(db, stripe, refund, T0 + DAY)).toEqual({ status: 200, body: { received: true } })
    } finally {
      warn.mockRestore()
    }
    expect((await db.select().from(sponsorships))[0]?.refundedAt).toBeNull()
    await close()
  })

  it('does not guess a refund on the customer when it also has a membership, or when the invoice is another subscription', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_refund_checkout_3')
    const membershipRefund = refundEvent('evt_membership_refund', 'charge.refunded', {
      id: 'ch_membership',
      refunded: true,
      amount_refunded: 1_000,
      payment_intent: 'pi_membership',
      customer: 'cus_sponsor',
    })
    const unknownRefund = refundEvent('evt_unknown_refund', 'charge.refunded', {
      id: 'ch_unknown',
      refunded: true,
      amount_refunded: 1_000,
      payment_intent: 'pi_unknown',
      customer: 'cus_sponsor',
    })
    const stripe = webhookStripe([completed, membershipRefund, unknownRefund], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
      invoiceByIntent: { pi_membership: 'in_membership' },
      invoiceSubscription: { in_membership: 'sub_membership' },
    })
    await send(db, stripe, completed, T0)
    await send(db, stripe, membershipRefund, T0 + DAY)
    expect((await db.select().from(sponsorships))[0]?.refundedAt).toBeNull()

    await db.insert(subscriptions).values({
      stripeSubscriptionId: 'sub_membership',
      stripeCustomerId: 'cus_sponsor',
      status: 'active',
      createdAt: T0,
      updatedAt: T0,
    } as typeof subscriptions.$inferInsert)
    await send(db, stripe, unknownRefund, T0 + DAY + 1)
    expect((await db.select().from(sponsorships))[0]?.refundedAt).toBeNull()
    await close()
  })

  it('does not fall back to the customer when the refunded invoice has no subscription', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_refund_checkout_4')
    // A one-off invoice for the same customer: found, but not a subscription invoice.
    const refund = refundEvent('evt_one_off_invoice_refund', 'charge.refunded', {
      id: 'ch_one_off_invoice',
      refunded: true,
      amount_refunded: 5_000,
      payment_intent: 'pi_one_off_invoice',
      customer: 'cus_sponsor',
    })
    const calls: string[] = []
    const stripe = webhookStripe([completed, refund], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
      invoiceByIntent: { pi_one_off_invoice: 'in_one_off' },
      calls,
    })
    await send(db, stripe, completed, T0)
    // Exactly one unrefunded sponsor subscription for the customer, and no membership.
    expect(await db.select().from(subscriptions)).toEqual([])
    expect(await send(db, stripe, refund, T0 + DAY)).toEqual({ status: 200, body: { received: true } })
    const row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({ refundedAt: null, updatedAt: T0 })
    expect(calls).toEqual(['invoicePayments.list:pi_one_off_invoice', 'invoices.retrieve:in_one_off'])
    expect(row && placementActiveAt(row, T0 + DAY + 1)).toBe(true)
    await close()
  })

  it('does not touch two sponsor subscriptions on the customer for an invoice-less refund', async () => {
    const { db, close } = await createTestDatabase()
    const first = checkoutCompleted('evt_two_subs_1')
    const second = checkoutCompleted('evt_two_subs_2', { id: 'cs_test_second', subscription: 'sub_sponsor_2' })
    const refund = refundEvent('evt_two_subs_refund', 'charge.refunded', {
      id: 'ch_two_subs',
      refunded: true,
      amount_refunded: 9_900,
      payment_intent: 'pi_two_subs',
      customer: 'cus_sponsor',
    })
    const stripe1 = webhookStripe([first, refund], { lineItems: foundingLines, subscription: foundingSubscription() })
    const stripe2 = webhookStripe([second], {
      lineItems: foundingLines,
      subscription: foundingSubscription({ metadata: { kind: 'sponsorship', offering: 'founding_sponsor', task_slug: 'images' } }),
      sessionSubscription: 'sub_sponsor_2',
    })
    await send(db, stripe1, first, T0)
    await send(db, stripe2, second, T0 + 1)
    const before = await db.select().from(sponsorships)
    expect(before.filter((row) => row.stripeCustomerId === 'cus_sponsor' && row.stripeSubscriptionId)).toHaveLength(2)
    await send(db, stripe1, refund, T0 + DAY)
    const after = await db.select().from(sponsorships)
    expect(after.map((row) => row.refundedAt)).toEqual([null, null])
    await close()
  })

  it('keeps a one-time refund on its payment intent without calling Stripe', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_one_time',
      stripePaymentIntentId: 'pi_one_time',
      stripeCustomerId: 'cus_sponsor',
      offering: 'placement_weekly',
      status: 'paid',
      paidAt: T0,
      email: 'sponsor@example.com',
      taskSlug: 'coding',
      createdAt: T0,
      updatedAt: T0,
    } as typeof sponsorships.$inferInsert)
    const refund = refundEvent('evt_one_time_refund', 'charge.refunded', {
      id: 'ch_one_time',
      refunded: true,
      amount_refunded: 9_900,
      payment_intent: 'pi_one_time',
      customer: 'cus_sponsor',
    })
    const calls: string[] = []
    const stripe = webhookStripe([refund], { lineItems: [], subscription: {}, calls })
    await send(db, stripe, refund, T0 + DAY)
    expect((await db.select().from(sponsorships))[0]?.refundedAt).toBe(T0 + DAY)
    expect(calls).toEqual([])
    await close()
  })

  it('does not move paid_through after a delete or past a scheduled cancel when invoice.paid arrives late', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_ooo_checkout')
    const deleted = subscriptionChange('evt_ooo_deleted', 'customer.subscription.deleted', T0S + 2 * 86_400, {
      status: 'canceled',
      canceled_at: T0S + 2 * 86_400,
      ended_at: T0S + 2 * 86_400,
    })
    const latePaid = invoiceEvent('evt_ooo_late_paid', 'invoice.paid', RENEW_END_S, TRIAL_END_S)
    const lateFailed = invoiceEvent('evt_ooo_late_failed', 'invoice.payment_failed', RENEW_END_S, TRIAL_END_S)
    const stripe = webhookStripe([completed, deleted, latePaid, lateFailed], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
    })
    await send(db, stripe, completed, T0)
    await send(db, stripe, deleted, T0 + 2 * DAY)
    await send(db, stripe, latePaid, T0 + 3 * DAY)
    await send(db, stripe, lateFailed, T0 + 3 * DAY + 1)
    let row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({
      subscriptionStatus: 'canceled',
      paidThrough: (T0S + 2 * 86_400) * 1000,
      paymentFailedAt: null,
    })
    expect(row && placementActiveAt(row, T0 + 3 * DAY)).toBe(false)
    await close()

    const second = await createTestDatabase()
    const completed2 = checkoutCompleted('evt_ooo_checkout_2')
    const scheduled = subscriptionChange('evt_ooo_sched', 'customer.subscription.updated', T0S + 86_400, {
      cancel_at_period_end: true,
      cancel_at: TRIAL_END_S,
    })
    const paidAfterSchedule = invoiceEvent('evt_ooo_paid_after_sched', 'invoice.paid', RENEW_END_S, T0S + 2 * 86_400)
    const stripe2 = webhookStripe([completed2, scheduled, paidAfterSchedule], {
      lineItems: foundingLines,
      subscription: foundingSubscription(),
    })
    await send(second.db, stripe2, completed2, T0)
    await send(second.db, stripe2, scheduled, T0 + DAY)
    await send(second.db, stripe2, paidAfterSchedule, T0 + 2 * DAY)
    row = (await second.db.select().from(sponsorships))[0]
    expect(row?.paidThrough).toBe(TRIAL_END_S * 1000)
    await second.close()
  })

  it('caps a first paid_through at a scheduled cancel when paid_through was still empty', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_null_cap_checkout')
    const paid = invoiceEvent('evt_null_cap_paid', 'invoice.paid', RENEW_END_S, T0S + 2 * 86_400)
    const stripe = webhookStripe([completed, paid], { lineItems: foundingLines, subscription: foundingSubscription() })
    await send(db, stripe, completed, T0)
    // A row with a scheduled cancel and no paid_through yet.
    await db.update(sponsorships).set({ paidThrough: null, cancelAt: TRIAL_END_S * 1000 })
    await send(db, stripe, paid, T0 + 2 * DAY)
    const row = (await db.select().from(sponsorships))[0]
    expect(row?.paidThrough).toBe(TRIAL_END_S * 1000)
    await close()
  })

  it('ignores a stale invoice.payment_failed after a newer invoice.paid, and a stale invoice.paid does not clear a newer failure', async () => {
    const { db, close } = await createTestDatabase()
    const completed = checkoutCompleted('evt_ooo2_checkout')
    // Renewal for the period ending RENEW_END: it failed first, then the retry paid. Delivered in reverse.
    const retryPaid = invoiceEvent('evt_ooo2_paid', 'invoice.paid', RENEW_END_S, TRIAL_END_S + 86_400)
    const staleFailed = invoiceEvent('evt_ooo2_failed', 'invoice.payment_failed', RENEW_END_S, TRIAL_END_S)
    const stripe = webhookStripe([completed, retryPaid, staleFailed], {
      lineItems: foundingLines,
      subscription: foundingSubscription({ status: 'active' }),
    })
    await send(db, stripe, completed, T0)
    await send(db, stripe, retryPaid, (TRIAL_END_S + 86_400) * 1000)
    await send(db, stripe, staleFailed, (TRIAL_END_S + 86_400) * 1000 + 5)
    let row = (await db.select().from(sponsorships))[0]
    expect(row).toMatchObject({ subscriptionStatus: 'active', paymentFailedAt: null, paidThrough: RENEW_END_S * 1000 })
    expect(row && placementActiveAt(row, RENEW_END_S * 1000 + 1)).toBe(true)
    await close()

    // The next period fails, then an older paid event for the previous period is delivered late.
    const second = await createTestDatabase()
    const completed2 = checkoutCompleted('evt_ooo3_checkout')
    const paid1 = invoiceEvent('evt_ooo3_paid1', 'invoice.paid', RENEW_END_S, TRIAL_END_S)
    const failed2 = invoiceEvent('evt_ooo3_failed2', 'invoice.payment_failed', RENEW_END_S + 30 * 86_400, RENEW_END_S)
    const stalePaid1 = invoiceEvent('evt_ooo3_paid1_replay', 'invoice.paid', RENEW_END_S, TRIAL_END_S + 60)
    const olderFailed = invoiceEvent('evt_ooo3_older_failed', 'invoice.payment_failed', RENEW_END_S + 30 * 86_400, RENEW_END_S - 60)
    const stripe2 = webhookStripe([completed2, paid1, failed2, stalePaid1, olderFailed], {
      lineItems: foundingLines,
      subscription: foundingSubscription({ status: 'active' }),
    })
    await send(second.db, stripe2, completed2, T0)
    await send(second.db, stripe2, paid1, TRIAL_END_S * 1000)
    await send(second.db, stripe2, failed2, RENEW_END_S * 1000)
    await send(second.db, stripe2, stalePaid1, RENEW_END_S * 1000 + 10)
    await send(second.db, stripe2, olderFailed, RENEW_END_S * 1000 + 20)
    row = (await second.db.select().from(sponsorships))[0]
    expect(row).toMatchObject({
      subscriptionStatus: 'past_due',
      paymentFailedAt: RENEW_END_S * 1000,
      paidThrough: RENEW_END_S * 1000,
    })
    await second.close()
  })
})
