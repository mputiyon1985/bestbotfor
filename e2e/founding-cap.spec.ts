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

test('a lost Checkout response keeps the founding hold; Try again replays the same session under the same key (Sentinel must-fix on #98)', async ({ page }) => {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Stripe Checkout</h1></main>' }),
  )
  await db.execute("DELETE FROM sponsorship_slot_claims WHERE task_slug = 'coding'")
  const email = `retry-founder-${Date.now()}@example.com`
  // Stripe makes the session, but the action never sees it (a 500 after the work was done).
  await fetch(`http://127.0.0.1:12111/__lose_response?email=${encodeURIComponent(email)}&times=1`, { method: 'POST' })

  await page.goto('/sponsor')
  await fillFoundingCheckout(page, email)
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.locator('#sponsor-status')).toHaveText('Checkout could not be started. Try again.')
  await expect(page).toHaveURL(/\/sponsor$/)

  // The founding hold was not released: it keeps its claimed_at and the fifth spot.
  const held = await db.execute("SELECT request_key, offering, claimed_at FROM sponsorship_slot_claims WHERE task_slug = 'coding'")
  const claimedAt = Number(held.rows[0]?.claimed_at)
  expect(held.rows[0]?.offering).toBe('founding_sponsor')
  expect(claimedAt).toBeGreaterThan(0)

  // An edited email under the same hold is refused before Stripe (Sentinel must-fix on #98):
  // one founding hold, one open checkout.
  await fillFoundingCheckout(page, `edited-${email}`)
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.locator('#sponsor-status')).toHaveText(
    /^This form already started a founding checkout with different details, and each founding spot can have only one open checkout\. Finish the checkout you opened, or reload the page in 6[45] minutes to start again with the new details\.$/,
  )
  await expect(page).toHaveURL(/\/sponsor$/)

  // Try again from the same form (same request_id; React resets the uncontrolled fields after
  // the action, so the buyer fills them in again): Stripe returns the session it already made.
  await fillFoundingCheckout(page, email)
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page).toHaveURL(/checkout\.stripe\.com/)

  const history = (await fetch(`http://127.0.0.1:12111/__history?email=${encodeURIComponent(email)}`).then((response) =>
    response.json(),
  )) as Array<Record<string, string>>
  expect(history.map((item) => item.__outcome)).toEqual(['created_response_lost', 'replayed'])
  const [first, retry] = history
  expect(retry?.__idempotency_key).toBe(first?.__idempotency_key)
  expect(first?.__idempotency_key).toMatch(new RegExp(`-h${claimedAt}$`))
  expect(retry?.__session_id).toBe(first?.__session_id)
  expect(page.url()).toContain(String(first?.__session_id))
  expect(retry?.expires_at).toBe(first?.expires_at)
  expect(Number(first?.expires_at)).toBe(Math.floor((claimedAt + 60 * 60 * 1000) / 1000))
  const after = await db.execute("SELECT request_key, claimed_at FROM sponsorship_slot_claims WHERE task_slug = 'coding'")
  expect(Number(after.rows[0]?.claimed_at)).toBe(claimedAt)
  expect(after.rows[0]?.request_key).toBe(held.rows[0]?.request_key)

  // 4 paid plus this hold: a new visitor sees the founding offer sold out, so no second founding session can open.
  await page.goto('/sponsor')
  await expect(foundingRadio(page)).toBeDisabled()
  await expect(foundingRadio(page)).toHaveAccessibleName(/Founding sponsor · Sold out/)
})
