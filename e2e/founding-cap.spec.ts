import { createClient, type Client } from '@libsql/client'
import { expect, test, type Page } from '@playwright/test'
import Stripe from 'stripe'
import { FOUNDING_SOLD_OUT, SPONSOR_TASK_FIELD_LABEL } from '../src/lib/sponsor-offerings'

// One server and database file for this file only (playwright project founding-cap).
// The steps build on each other: 4 of 5 taken, then 5 of 5, then a refund.
test.describe.configure({ mode: 'serial' })

const DATABASE_URL = 'file:./data/e2e-founding-cap.db'
const WEBHOOK_SECRET = ['whsec', 'e2e', 'placeholder'].join('_')
const LAST_SPOT_KEY = 'founding_link:cs_e2e_link_5'
const LAST_SPOT_INTENT = 'pi_e2e_link_5'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let db: Client

test.beforeAll(async () => {
  db = createClient({ url: DATABASE_URL })
  await db.execute('PRAGMA busy_timeout = 5000')
  await db.batch(['DELETE FROM sponsorship_slot_claims', 'DELETE FROM sponsorships'], 'write')
  const now = Date.now()
  // Four paid, unrefunded in-app founding sponsors.
  for (const [index, task] of ['writing', 'images', 'video', 'voice'].entries()) {
    await db.execute({
      sql: `INSERT INTO sponsorships (stripe_checkout_session_id, offering, status, task_slug, created_at, updated_at, paid_at,
        stripe_subscription_id, subscription_status, paid_through)
        VALUES (?, 'founding_sponsor', 'paid', ?, ?, ?, ?, ?, 'trialing', ?)`,
      args: [`cs_e2e_founder_${index}`, task, now, now, now, `sub_e2e_founder_${index}`, now + 14 * 86_400_000],
    })
  }
})

test.afterAll(() => {
  db?.close()
})

const foundingRadio = (page: Page) => page.getByRole('radio', { name: /Founding sponsor/ })

async function fillFoundingCheckout(page: Page, email: string): Promise<void> {
  await foundingRadio(page).check()
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('textbox', { name: 'Company' }).fill('Founding Tools')
  await page.getByLabel(SPONSOR_TASK_FIELD_LABEL).selectOption('coding')
  await page.getByLabel('Tool name').fill('Widget')
  await page.getByLabel('One-line description').fill('A useful coding tool.')
  await page.getByLabel('Tool URL').fill('https://example.com/widget')
  await page.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('button', { name: 'Continue to checkout' })).toBeEnabled()
}

test('4 of 5 founding spots taken: the founding option is open', async ({ page }) => {
  await page.goto('/sponsor')
  await expect(foundingRadio(page)).toBeEnabled()
  await expect(page.getByText('Sold out')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'Founding sponsor: $99 for 2 weeks, then $299/mo.' })).toContainText(
    'Limited to 5 founding sponsors.',
  )
})

test('the last spot goes while the page is open: checkout is refused server-side, then the option renders Sold out', async ({ page }) => {
  await page.route('https://checkout.stripe.com/**', (route) => route.abort())
  await page.goto('/sponsor')
  const email = `late-founder-${Date.now()}@example.com`
  await fillFoundingCheckout(page, email)

  // Another buyer's founding Payment Link sale is recorded: 5 of 5.
  const now = Date.now()
  await db.execute({
    sql: `INSERT INTO sponsorships (stripe_checkout_session_id, stripe_payment_intent_id, offering, status, task_slug, created_at, updated_at, paid_at)
      VALUES (?, ?, 'placement_monthly', 'paid', 'research', ?, ?, ?)`,
    args: [LAST_SPOT_KEY, LAST_SPOT_INTENT, now, now, now],
  })

  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.locator('#sponsor-status')).toHaveText(FOUNDING_SOLD_OUT)
  await expect(page.locator('#sponsor-status')).toHaveAttribute('role', 'alert')
  await expect(page).toHaveURL(/\/sponsor$/)
  // No hold and no Stripe session for this buyer.
  const holds = await db.execute("SELECT count(*) AS n FROM sponsorship_slot_claims WHERE task_slug = 'coding'")
  expect(Number(holds.rows[0]?.n)).toBe(0)
  const recorded = (await fetch('http://127.0.0.1:12111/__requests').then((response) => response.json())) as Array<Record<string, string>>
  expect(recorded.filter((item) => item['metadata[email]'] === email)).toEqual([])

  await page.reload()
  await expect(foundingRadio(page)).toBeDisabled()
  await expect(foundingRadio(page)).toHaveAccessibleName(/Founding sponsor · Sold out/)
  await expect(page.getByText('All founding sponsor spots are taken.')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Founding sponsor: Sold out.' })).toHaveText(
    'Founding sponsor: Sold out. All 5 founding sponsor spots are taken.',
  )
  await expect(page.getByText('$99 for 2 weeks')).toHaveCount(0)
  // The other offers stay on sale.
  await expect(page.getByRole('radio', { name: /one week/ })).toBeEnabled()
})

test('rule F: a refund of the last spot through the signed webhook frees it and reopens the founding option', async ({ page, request }) => {
  const event = {
    id: `evt_e2e_refund_${Date.now()}`,
    object: 'event',
    type: 'charge.refunded',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: '2026-09-30.endive',
    data: {
      object: {
        id: 'ch_e2e_link_5',
        object: 'charge',
        refunded: true,
        amount_refunded: 29_900,
        payment_intent: LAST_SPOT_INTENT,
      },
    },
  }
  const payload = JSON.stringify(event)
  const stripe = new Stripe(['sk', 'test', 'e2e', 'placeholder'].join('_'))
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
  const response = await request.post('/api/stripe/webhook', {
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    data: payload,
  })
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ received: true })
  const row = await db.execute({ sql: 'SELECT refunded_at FROM sponsorships WHERE stripe_checkout_session_id = ?', args: [LAST_SPOT_KEY] })
  expect(Number(row.rows[0]?.refunded_at)).toBeGreaterThan(0)

  await page.goto('/sponsor')
  await expect(foundingRadio(page)).toBeEnabled()
  await expect(page.getByText('Sold out')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'Founding sponsor: $99 for 2 weeks, then $299/mo.' })).toBeVisible()
})
