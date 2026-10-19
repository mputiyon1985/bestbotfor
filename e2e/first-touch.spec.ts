import { expect, test } from '@playwright/test'

const KEY = 'bbf_first_touch'

test('first-touch tags are stored once, without consent, and sent with a newsletter signup', async ({ page }) => {
  await page.goto('/best/music?utm_source=facebook&utm_medium=social&utm_campaign=w1_oct19&utm_content=fb1%3Cx%3E')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY)).not.toBeNull()
  const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY)) ?? '{}')
  expect(stored).toMatchObject({
    utm_source: 'facebook',
    utm_medium: 'social',
    utm_campaign: 'w1_oct19',
    utm_content: 'fb1x',
    landing_path: '/best/music',
  })
  // No consent was given; the banner is still offering the choice.
  expect(await page.evaluate(() => document.cookie)).not.toContain('bbf_consent=granted')

  await page.goto('/newsletter?utm_source=x&utm_campaign=later')
  const again = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), KEY)) ?? '{}')
  expect(again.utm_source).toBe('facebook')
  expect(again.utm_campaign).toBe('w1_oct19')

  const field = page.locator('form input[name="first_touch"]').first()
  await expect(field).toHaveValue(/"utm_source":"facebook"/)
  await page.getByLabel('Email address').fill('utm-reader@example.com')
  await page.getByRole('button', { name: 'Get The Daily Bot' }).click()
  await expect(page.getByRole('status')).toHaveText("You'll get a confirmation email when The Daily Bot launches.")
})

test('a visit without tags stores nothing', async ({ page }) => {
  await page.goto('/?q=hello')
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  await expect(page.locator('form input[name="first_touch"]').first()).toHaveValue('')
})

test('every page sets twitter:site to @bestbotfor', async ({ page }) => {
  for (const url of ['/', '/best/music', '/newsletter']) {
    await page.goto(url)
    await expect(page.locator('meta[name="twitter:site"]')).toHaveAttribute('content', '@bestbotfor')
  }
})

test('the privacy policy says we record which link brought a visitor', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByText('We record which link brought you to the site')).toBeVisible()
})

test('nothing is captured after analytics is rejected or with Global Privacy Control', async ({ browser, baseURL }) => {
  const denied = await browser.newContext()
  await denied.addCookies([{ name: 'bbf_consent', value: 'denied', url: baseURL ?? 'http://localhost:3000' }])
  const page = await denied.newPage()
  await page.goto('/best/music?utm_source=facebook&utm_campaign=w1_oct19')
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  await denied.close()

  const gpc = await browser.newContext()
  await gpc.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }))
  const gpcPage = await gpc.newPage()
  await gpcPage.goto('/best/music?utm_source=facebook&utm_campaign=w1_oct19')
  await gpcPage.waitForLoadState('networkidle')
  expect(await gpcPage.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull()
  await gpc.close()
})
