import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
})

test('the sponsor CTA follows the ranking and the top pick stays above the fold at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/best/coding/free')
  const ranked = page.getByRole('list', { name: /Free tools ranked/ })
  const first = ranked.getByRole('listitem').first()
  await expect(first.getByRole('link').first()).toBeInViewport()
  const freeCta = page.locator('[data-sponsor-page-cta]')
  const rankedBox = await ranked.boundingBox()
  const freeCtaBox = await freeCta.boundingBox()
  expect(freeCtaBox?.y ?? 0).toBeGreaterThan((rankedBox?.y ?? 0) + (rankedBox?.height ?? 0))

  await page.goto('/best/coding')
  const visit = page.getByRole('link', { name: /^Visit / }).first()
  await expect(visit).toBeInViewport()
  const seeAll = page.getByRole('link', { name: 'See all matches' })
  const bestCta = page.locator('[data-sponsor-page-cta]')
  const seeAllBox = await seeAll.boundingBox()
  const bestCtaBox = await bestCta.boundingBox()
  expect(bestCtaBox?.y ?? 0).toBeGreaterThan((seeAllBox?.y ?? 0) + (seeAllBox?.height ?? 0))
  await expect(bestCta.getByRole('link', { name: 'Sponsor this page' })).toHaveAttribute('href', '/sponsor?task=coding')
  await expect(bestCta.getByRole('link', { name: 'Get featured here' })).toBeVisible()
})

test('a quiz result puts the sponsor CTA after Alternatives and opens the pre-selected sponsor form', async ({ page }) => {
  await page.goto('/result?task=chat&budget=any&skill=beginner')
  const alternatives = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Alternatives' }) })
  const cta = page.locator('[data-sponsor-page-cta]')
  const alternativesBox = await alternatives.boundingBox()
  const ctaBox = await cta.boundingBox()
  expect(ctaBox?.y ?? 0).toBeGreaterThan((alternativesBox?.y ?? 0) + (alternativesBox?.height ?? 0))
  await cta.getByRole('link', { name: 'Sponsor this page' }).click()
  await expect(page).toHaveURL(/\/sponsor\?task=chat$/)
  await expect(page.locator('#sponsor-task')).toHaveValue('chat')
})
