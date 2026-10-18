import { expect, test } from '@playwright/test'
import {
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_INTEGRATION_IDENTIFIER,
  SPONSOR_REVIEW_NOTICE,
  SPONSOR_TASK_FIELD_LABEL,
} from '../src/lib/sponsor-offerings'

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
  await expect(page.getByRole('listitem').filter({ hasText: 'Featured placement: $99 for one week.' })).toContainText(
    'One-time payment, no auto-renewal.',
  )
  await expect(page.getByRole('listitem').filter({ hasText: 'Featured placement: $299 for one month.' })).toContainText(
    'One-time payment, no auto-renewal.',
  )
  await expect(page.getByRole('listitem').filter({ hasText: 'Newsletter sponsor slot: $49 per issue.' })).toContainText(
    'One-time payment, no auto-renewal.',
  )
  await expect(page.getByRole('radio', { name: /One-time payment, no auto-renewal/ })).toHaveCount(3)
  await expect(page.getByText('Your company name is published with a Sponsored label.')).toBeVisible()
  await expect(page.getByText(SPONSOR_REVIEW_NOTICE)).toBeVisible()

  await page.getByRole('radio', { name: /one month/ }).check()
  await page.getByLabel('Work email').fill('sponsor@example.com')
  await page.getByRole('textbox', { name: 'Company' }).fill('Example Tools')
  await page.getByLabel(SPONSOR_TASK_FIELD_LABEL).selectOption('coding')
  await page.getByLabel('Tool name').fill('Widget')
  await page.getByLabel('One-line description').fill('A useful coding tool.')
  await page.getByLabel('Tool URL').fill('https://example.com/widget')
  await page.getByLabel('Logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
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
  expect(session?.['line_items[0][quantity]']).toBe('1')
  expect(session?.success_url).toBe('http://127.0.0.1:3000/sponsor/success?session_id={CHECKOUT_SESSION_ID}')
  expect(session?.cancel_url).toBe('http://127.0.0.1:3000/sponsor/cancel')
  expect(session?.['line_items[0][price_data][unit_amount]']).toBeUndefined()
  expect(session?.['metadata[kind]']).toBe('sponsorship')
  expect(session?.['metadata[company]']).toBe('Example Tools')
  expect(session?.['metadata[task_slug]']).toBe('coding')
  expect(session?.['metadata[offering]']).toBe('placement_monthly')
  expect(session?.['metadata[creative_id]']).toMatch(/^[1-9]\d*$/)
  expect(session?.payment_method_types).toBeUndefined()
  expect(session?.['payment_method_types[0]']).toBeUndefined()
  expect(session?.integration_identifier).toBe(SPONSOR_INTEGRATION_IDENTIFIER)
  expect(session?.['custom_text[submit][message]']).toBe('One-time payment, no auto-renewal.')
  expect(session?.['payment_intent_data[statement_descriptor_suffix]']).toBe('BestBotFor')
  expect(session?.['payment_intent_data[statement_descriptor]']).toBeUndefined()
  expect(session?.['managed_payments[enabled]']).toBe('false')
  expect(session?.['automatic_tax[enabled]']).toBeUndefined()
  expect(JSON.stringify(session)).not.toContain('automatic_tax')
  expect(JSON.stringify(session)).not.toContain('unit_amount')
})

test('founding sponsor checkout is a subscription with the $99 first period and a 14-day trial', async ({ page }) => {
  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Stripe Checkout</h1></main>' })
  })
  await fetch('http://127.0.0.1:12111/__reset', { method: 'POST' })

  await page.goto('/sponsor')
  await expect(page.getByRole('listitem').filter({ hasText: 'Founding sponsor: $99 for 2 weeks, then $299/mo.' })).toContainText(
    SPONSOR_FOUNDING_NOTICE,
  )
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Featured placement, monthly subscription: $299/mo.' }),
  ).toContainText('until you cancel')
  await page.getByRole('radio', { name: /Founding sponsor/ }).check()
  await page.getByLabel('Work email').fill('founder@example.com')
  await page.getByRole('textbox', { name: 'Company' }).fill('Founding Tools')
  await page.getByLabel(SPONSOR_TASK_FIELD_LABEL).selectOption('writing')
  await page.getByLabel('Tool name').fill('Widget')
  await page.getByLabel('One-line description').fill('A useful writing tool.')
  await page.getByLabel('Tool URL').fill('https://example.com/widget')
  await page.getByLabel('Logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page).toHaveURL(/checkout\.stripe\.com/)

  const recorded = (await fetch('http://127.0.0.1:12111/__requests').then((response) => response.json())) as Array<
    Record<string, string>
  >
  const session = recorded.find((item) => item['metadata[email]'] === 'founder@example.com')
  expect(session?.mode).toBe('subscription')
  expect(session?.['line_items[0][price]']).toBe('price_e2e_founding_monthly')
  expect(session?.['line_items[1][price]']).toBe('price_e2e_founding_setup')
  expect(session?.['subscription_data[trial_period_days]']).toBe('14')
  expect(session?.['subscription_data[metadata][kind]']).toBe('sponsorship')
  expect(session?.['subscription_data[metadata][offering]']).toBe('founding_sponsor')
  expect(session?.['subscription_data[metadata][price_lock_months]']).toBe('6')
  expect(session?.['custom_text[submit][message]']).toBe(SPONSOR_FOUNDING_NOTICE)
  expect(session?.['payment_intent_data[statement_descriptor_suffix]']).toBeUndefined()
  expect(JSON.stringify(session)).not.toContain('unit_amount')
})

test('disclosure names paid placements and a guide without one is unlabeled', async ({ page }) => {
  await page.goto('/disclosure')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Disclosures')
  await expect(page.getByText(/paid featured placements/)).toBeVisible()
  await expect(page.getByText(/newsletter sponsorships/)).toBeVisible()
  await expect(page.getByText(/labeled Sponsored/)).toBeVisible()
  await page.goto('/best/coding')
  await expect(page.getByRole('complementary', { name: 'Sponsored' })).toHaveCount(0)
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
