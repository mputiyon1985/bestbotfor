import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { createTestDatabase } from '@/test/db'
import { applyMigrations } from './db/migrate'
import { sponsorAbandonedCheckouts, sponsorships } from './db/schema'
import { handleStripeWebhook } from './stripe-webhook'
import { parseExpiredSponsorCheckout, sponsorRecoveryUrl } from './sponsor-abandoned'

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
      recoveryUrl: 'https://buy.stripe.com/r/test_recovery',
    })
  })

  it('reads a Monthly Payment Link only when Stripe included an email', () => {
    const withEmail = parseExpiredSponsorCheckout(
      expired('evt_link', {
        id: 'cs_test_monthly',
        payment_status: 'unpaid',
        payment_link: 'plink_1URyeXIJUbygfAucnLlkSP5u',
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
  })

  it('ignores a paid session, a membership session, and a retired founding link that disagrees with its offer', () => {
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
})

describe('checkout.session.expired webhook', () => {
  it('records the lead once and does not open a sponsorship', async () => {
    const { db, close } = await createTestDatabase()
    const event = expired('evt_expire_once', {
      id: 'cs_test_once',
      payment_status: 'unpaid',
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
      payment_link: { id: 'plink_1URyeXIJUbygfAucnLlkSP5u' },
      metadata: { offer: 'sponsor_monthly', source: 'payment_link' },
    })
    const secondEvent = expired('evt_expire_b', {
      id: 'cs_test_fill',
      payment_status: 'unpaid',
      customer_details: { email: 'other@example.com' },
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
    await applyMigrations(url)
    const again = createClient({ url })
    const names = (await again.execute('PRAGMA table_info(sponsor_abandoned_checkouts)')).rows.map((row) => String(row.name))
    expect(names).toEqual(expect.arrayContaining(['email', 'offering', 'expired_at', 'task_slug', 'source', 'recovery_url', 'created_at']))
    const kept = await again.execute('SELECT email, offering, recovery_url FROM sponsor_abandoned_checkouts')
    expect(kept.rows).toEqual([{ email: 'keep@example.com', offering: 'sponsor_monthly', recovery_url: null }])
    const ledger = await again.execute(
      "SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '0026_sponsor_abandoned_checkouts.sql'",
    )
    expect(Number(ledger.rows[0]?.n)).toBe(1)
    again.close()
  })
})

describe('abandoned checkout surfaces', () => {
  it('shows the leads on the sponsor admin page and names the Dashboard steps', () => {
    const admin = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsors/page.tsx'), 'utf8')
    expect(admin).toContain('Abandoned checkouts')
    expect(admin).toContain('listAbandonedSponsorCheckouts')
    expect(admin).toContain('This page does not email anyone.')
    const runbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/sponsor-payment-links.md'), 'utf8')
    expect(runbook).toContain('checkout.session.expired')
    expect(runbook).toContain('plink_1URyeXIJUbygfAucnLlkSP5u')
    expect(runbook).toContain('consent_collection.promotions')
    expect(runbook).toContain('after_expiration.recovery')
    expect(runbook).toContain('needs Mark\'s OK')
    expect(runbook).toContain('Nov 1')
    expect(runbook).not.toMatch(/sk_(live|test)_|rk_(live|test)_|whsec_/)
  })
})
