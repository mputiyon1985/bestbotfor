import { expect, test } from '@playwright/test'

test('header and footer use the lockup and the tagline', async ({ page }) => {
  await page.goto('/')
  const headerLogo = page.getByRole('banner').getByRole('link', { name: 'BestBotFor' })
  await expect(headerLogo.locator('img').nth(0)).toHaveAttribute('src', '/brand/bestbotfor-lockup-light.svg')
  await expect(headerLogo.locator('img').nth(1)).toHaveAttribute('src', '/brand/bestbotfor-lockup-dark.svg')
  const footerLogo = page.getByRole('contentinfo').getByRole('link', { name: 'BestBotFor' })
  await expect(footerLogo.locator('img').nth(0)).toHaveAttribute('src', '/brand/bestbotfor-lockup-light.svg')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three questions. One best bot.')
  await expect(page.getByRole('contentinfo')).toContainText('Three questions. One best bot.')
})

test('favicons, manifest, and the default preview image are the kit files', async ({ page, request }) => {
  await page.goto('/')
  const icons = await page.locator('link[rel="icon"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href')),
  )
  expect(icons.some((href) => href?.includes('favicon.ico'))).toBe(true)
  expect(icons.some((href) => href?.includes('favicon.svg'))).toBe(true)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /site\.webmanifest/)
  const og = page.locator('meta[property="og:image"]')
  await expect(og.first()).toHaveAttribute('content', /og-default-1200x630\.png/)

  for (const path of [
    '/favicon.ico',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/android-chrome-192.png',
    '/android-chrome-512.png',
    '/maskable-512.png',
    '/site.webmanifest',
    '/og/og-default-1200x630.png',
    '/brand/bestbotfor-lockup-light.svg',
    '/brand/bestbotfor-lockup-dark.svg',
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
  }
})
