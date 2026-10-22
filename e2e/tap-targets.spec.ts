import { expect, test, type Locator, type Page } from '@playwright/test'

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value, await locator.evaluate((node) => (node.textContent ?? '').trim().slice(0, 40)).catch(() => 'missing')).not.toBeNull()
  return value!
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function expectTapHeight(locator: Locator, label: string) {
  const value = await box(locator)
  expect(value.height, label).toBeGreaterThanOrEqual(44)
}

async function expectFullButton(locator: Locator, label: string) {
  const value = await box(locator)
  expect(value.height, `${label} height`).toBeGreaterThanOrEqual(44)
  expect(value.width, `${label} width`).toBeGreaterThanOrEqual(44)
  const border = await locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).borderTopWidth))
  expect(border, `${label} border`).toBeGreaterThan(0)
}

async function logo(page: Page) {
  return box(page.getByRole('banner').getByRole('link', { name: 'BestBotFor' }))
}

test('key controls meet the 44px tap target at 390px', async ({ page }) => {
  await page.context().addCookies([
    { name: 'bbf_consent', value: 'denied', domain: '127.0.0.1', path: '/' },
  ])
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/')
  const cta = page.getByRole('button', { name: 'See my best bot' })
  const ctaBox = await box(cta)
  expect(ctaBox.height).toBeGreaterThanOrEqual(44)
  expect(ctaBox.y).toBeGreaterThanOrEqual(0)
  expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(844)

  const footer = page.getByRole('contentinfo')
  await expectTapHeight(footer.getByRole('link', { name: 'Write code', exact: true }), 'footer job link')
  await expectTapHeight(footer.getByRole('link', { name: 'About', exact: true }), 'footer about')
  await expectTapHeight(footer.getByRole('button', { name: 'Cookie settings' }), 'cookie settings')

  await page.goto('/best/coding')
  const crumb = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Home' })
  await expectTapHeight(crumb, 'breadcrumb')
  const toolLink = page.getByRole('list', { name: /Tools ranked/ }).getByRole('link').first()
  await expectTapHeight(toolLink, 'best list tool link')
  const crumbBox = await box(crumb)
  const bestLogo = await logo(page)
  expect(overlaps(bestLogo, crumbBox)).toBe(false)
  expect(crumbBox.y - (bestLogo.y + bestLogo.height)).toBeGreaterThanOrEqual(24)

  await page.goto('/result')
  const back = page.getByRole('link', { name: 'Back to the questions' })
  const backBox = await box(back)
  const resultLogo = await logo(page)
  expect(overlaps(resultLogo, backBox)).toBe(false)
  expect(backBox.y - (resultLogo.y + resultLogo.height)).toBeGreaterThanOrEqual(24)

  await page.goto('/result?task=chat&view=all')
  const pages = page.getByRole('navigation', { name: 'Pages' })
  await expectFullButton(pages.getByRole('link', { name: 'Page 1' }), 'page 1')
  await expectFullButton(pages.getByRole('link', { name: 'Page 2' }), 'page 2')
  await expectFullButton(pages.getByRole('link', { name: 'Next page' }), 'next page')

  await page.goto('/tools')
  await expectFullButton(page.getByRole('link', { name: 'Next page' }), 'tools next page')

  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/')
  const headerLinks = page.getByRole('navigation', { name: 'Primary' }).getByRole('link')
  const headerCount = await headerLinks.count()
  expect(headerCount).toBeGreaterThan(3)
  for (let index = 0; index < headerCount; index += 1) {
    await expectTapHeight(headerLinks.nth(index), `header link ${index}`)
  }
})
