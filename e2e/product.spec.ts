import { expect, test } from '@playwright/test'

test('previews ask crawlers not to index', async ({ page, request }) => {
  const home = await request.get('/')
  expect(home.headers()['x-robots-tag']).toContain('noindex')
  await page.goto('/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const robots = await request.get('/robots.txt')
  const body = await robots.text()
  expect(body).toContain('Disallow: /')
  expect(body).not.toMatch(/Allow:\s+\//)
})

test('cookie settings reopens the banner', async ({ page, context }) => {
  await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Analytics cookies' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cookie settings' }).click()
  await expect(page.getByRole('region', { name: 'Analytics cookies' })).toBeVisible()
})

test('pricing says checkout is test mode with the test key', async ({ page }) => {
  const notice = page.getByRole('main').getByRole('alert')
  await page.goto('/pricing')
  await expect(page.getByRole('note')).toContainText('Stripe test mode')
  await expect(page.getByRole('note')).toContainText('No real charges')
  await expect(notice).toHaveCount(0)

  await page.goto('/pricing?notice=rate')
  await expect(notice).toHaveText('Too many checkout attempts from this account. Try again in an hour.')
  await page.goto('/pricing?notice=unavailable')
  await expect(notice).toHaveText('Checkout is temporarily unavailable. Try again.')
})

test('the tools directory is paginated', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools')
  await page.getByRole('link', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.getByRole('link', { name: 'Previous page' })).toBeVisible()
})

test('best guides publish an item list and an faq', async ({ page }) => {
  await page.goto('/best/coding')
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  const combined = blocks.join('\n')
  expect(combined).toContain('ItemList')
  expect(combined).toContain('FAQPage')
})
