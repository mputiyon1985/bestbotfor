import { expect, test } from '@playwright/test'
import {
  ANDROID_CHROME_192_PATH,
  APPLE_TOUCH_ICON_PATH,
  HASHED_ASSET_CACHE_CONTROL,
  LOGO_DARK_PATH,
  LOGO_LIGHT_PATH,
  MASKABLE_ICON_PATH,
  OG_IMAGE_PATH,
  ORGANIZATION_LOGO_PATH,
  SVG_CONTENT_SECURITY_POLICY,
} from '../src/lib/brand'

test('header and footer inline the lockup and the tagline', async ({ page }) => {
  await page.goto('/')
  const headerLogo = page.getByRole('banner').getByRole('link', { name: 'BestBotFor' })
  await expect(headerLogo.locator('img')).toHaveCount(0)
  await expect(headerLogo.locator('svg')).toHaveCount(2)
  await expect(headerLogo.locator('svg').nth(0)).toBeVisible()
  const footerLogo = page.getByRole('contentinfo').getByRole('link', { name: 'BestBotFor' })
  await expect(footerLogo.locator('svg').nth(0)).toBeVisible()
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
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', new RegExp(APPLE_TOUCH_ICON_PATH.replace(/[.]/g, '\\.')))
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /site\.webmanifest/)
  const og = page.locator('meta[property="og:image"]')
  await expect(og.first()).toHaveAttribute('content', /og-default-1200x630\.[0-9a-f]{8}\.png/)

  for (const path of [
    '/favicon.ico',
    '/favicon.svg',
    APPLE_TOUCH_ICON_PATH,
    ANDROID_CHROME_192_PATH,
    ORGANIZATION_LOGO_PATH,
    MASKABLE_ICON_PATH,
    '/site.webmanifest',
    OG_IMAGE_PATH,
    LOGO_LIGHT_PATH,
    LOGO_DARK_PATH,
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
  }
})

test('svg files carry a locked content security policy', async ({ request }) => {
  for (const path of ['/favicon.svg', LOGO_LIGHT_PATH, LOGO_DARK_PATH]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-security-policy'], path).toBe(SVG_CONTENT_SECURITY_POLICY)
  }
})

test('hashed brand files are immutable for a year', async ({ request }) => {
  const response = await request.get(OG_IMAGE_PATH)
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe(HASHED_ASSET_CACHE_CONTROL)
})
