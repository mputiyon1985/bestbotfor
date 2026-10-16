import { expect, test } from '@playwright/test'
import { SPONSOR_INTEGRATION_IDENTIFIER } from '../src/lib/sponsor-offerings'

test('sponsor page creates a hosted checkout session from the server price', async ({ page }) => {
  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<main><h1>Stripe Checkout</h1></main>',
    })
  })
  await fetch('http://127.0.0.1:12111/__reset', { method: 'POST' })

  await page.goto('/sponsor')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sponsor')
  await expect(page.getByRole('note')).toContainText('Stripe test mode')
  await expect(page.getByText('Featured placement: $99 for one week, or $299 for one month.')).toBeVisible()
  await expect(page.getByText('Newsletter sponsor slot: $49 per issue.')).toBeVisible()

  await page.getByRole('radio', { name: /one month/ }).check()
  await page.getByLabel('Work email').fill('sponsor@example.com')
  await page.getByRole('textbox', { name: 'Company' }).fill('Example Tools')
  await page.getByLabel('Task page').selectOption('coding')
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page).toHaveURL(/checkout\.stripe\.com/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stripe Checkout')

  const recorded = (await fetch('http://127.0.0.1:12111/__requests').then((response) => response.json())) as Array<
    Record<string, string>
  >
  const session = recorded.find((item) => item['metadata[email]'] === 'sponsor@example.com')
  expect(session).toBeTruthy()
  expect(session?.mode).toBe('payment')
  expect(session?.['line_items[0][price]']).toBe('price_e2e_monthly')
  expect(session?.['line_items[0][price_data][unit_amount]']).toBeUndefined()
  expect(session?.['metadata[kind]']).toBe('sponsorship')
  expect(session?.['metadata[company]']).toBe('Example Tools')
  expect(session?.['metadata[task_slug]']).toBe('coding')
  expect(session?.['metadata[offering]']).toBe('placement_monthly')
  expect(session?.payment_method_types).toBeUndefined()
  expect(session?.['payment_method_types[0]']).toBeUndefined()
  expect(session?.integration_identifier).toBe(SPONSOR_INTEGRATION_IDENTIFIER)
  expect(session?.['managed_payments[enabled]']).toBe('false')
  expect(session?.['automatic_tax[enabled]']).toBeUndefined()
  expect(JSON.stringify(session)).not.toContain('automatic_tax')
  expect(JSON.stringify(session)).not.toContain('unit_amount')
})

test('sponsor success and cancel pages do not record the payment', async ({ page }) => {
  await page.goto('/sponsor/success')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checkout received')
  await expect(page.getByText(/webhook/)).toBeVisible()
  await expect(page.getByText(/No card details/)).toBeVisible()
  await page.goto('/sponsor/cancel')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checkout canceled')
  await expect(page.getByText(/have not been charged/)).toBeVisible()
})
