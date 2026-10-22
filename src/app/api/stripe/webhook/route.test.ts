import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { getDb, resetDbCache } from '@/lib/db/client'
import { applyMigrations } from '@/lib/db/migrate'
import { stripeEvents } from '@/lib/db/schema'
import { resetStripeCache } from '@/lib/stripe'
import { STRIPE_API_VERSION } from '@/lib/stripe-key'

const SECRET = 'whsec_route'
const KEY = ['sk', 'test', 'route'].join('_')
const ENV_KEYS = [
  'TURSO_DATABASE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_ALLOW_LIVE',
  'STRIPE_API_HOST',
  'STRIPE_API_PORT',
] as const

const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>
const directories: string[] = []
let opened = false

afterEach(async () => {
  if (opened) {
    getDb().$client.close()
    opened = false
  }
  resetDbCache()
  resetStripeCache()
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('POST /api/stripe/webhook', () => {
  it('accepts a raw body signed with the webhook secret', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-webhook-'))
    directories.push(root)
    process.env.TURSO_DATABASE_URL = `file:${path.join(root, 'webhook.db')}`
    process.env.STRIPE_SECRET_KEY = KEY
    process.env.STRIPE_WEBHOOK_SECRET = SECRET
    process.env.STRIPE_ALLOW_LIVE = 'false'
    delete process.env.STRIPE_API_HOST
    delete process.env.STRIPE_API_PORT
    resetDbCache()
    resetStripeCache()
    opened = true
    await applyMigrations(process.env.TURSO_DATABASE_URL)

    const payload = [
      '{',
      '  "id": "evt_hmac_route",',
      '  "object": "event",',
      `  "api_version": "${STRIPE_API_VERSION}",`,
      '  "livemode": false,',
      '  "type": "payment_intent.succeeded",',
      '  "data": {"object": {"id": "pi_hmac_route", "object": "payment_intent", "receipt_email": "route-secret@example.com"}}',
      '}',
    ].join('\n')
    expect(JSON.stringify(JSON.parse(payload))).not.toBe(payload)

    const stripe = new Stripe(KEY, { apiVersion: STRIPE_API_VERSION })
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const request = new Request('https://bestbotfor.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      body: payload,
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
    const rows = await getDb().select().from(stripeEvents).where(eq(stripeEvents.id, 'evt_hmac_route'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.processedAt).toBeGreaterThan(0)
    expect(info.mock.calls.flat().join(' ')).not.toContain('route-secret@example.com')
    expect(info).toHaveBeenCalledWith('stripe webhook event', 'payment_intent.succeeded')

    const tampered = new Request('https://bestbotfor.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      body: payload.replace('evt_hmac_route', 'evt_hmac_other'),
    })
    const rejected = await POST(tampered)
    expect(rejected.status).toBe(400)
    expect(await getDb().select().from(stripeEvents)).toHaveLength(1)
    info.mockRestore()
  })
})
