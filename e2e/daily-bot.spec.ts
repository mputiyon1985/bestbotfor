import { expect, test, type Locator, type Page } from '@playwright/test'

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void
  __gaEvents?: unknown[][]
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  return value!
}

async function expectBelow(upper: Locator, lower: Locator) {
  const upperBox = await box(upper)
  const lowerBox = await box(lower)
  expect(lowerBox.y).toBeGreaterThan(upperBox.y)
}

function dailyBot(page: Page) {
  return page.getByRole('region', { name: 'The Daily Bot' })
}

test('the homepage offers the Daily Bot', async ({ page }) => {
  await page.goto('/')
  const region = dailyBot(page)
  await expect(region).toHaveCount(1)
  await expect(region.getByLabel('Email address')).toBeVisible()
  await expect(region.getByRole('button', { name: 'Get the daily digest' })).toBeVisible()
  await expectBelow(page.getByRole('heading', { name: 'Questions', exact: true }), region)
})

test('a quiz result shows the Daily Bot under the pick and a free-account prompt', async ({ page }) => {
  await page.goto('/result?task=chat&budget=any&skill=beginner')
  const region = dailyBot(page)
  await expect(region).toHaveCount(1)
  await expectBelow(page.getByRole('heading', { level: 1 }), region)
  await expectBelow(region, page.getByRole('heading', { name: 'Alternatives' }))
  const link = page.getByRole('link', { name: 'Save this pick: free account' })
  await expect(link).toHaveAttribute('href', /\/sign-up\?redirect_url=/)
  await link.click()
  await expect(page).toHaveURL(/\/sign-up\?redirect_url=/)
  await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible()
  await expect(page.getByText('Account creation is not configured on this server yet.')).toBeVisible()
  const redirect = new URL(page.url()).searchParams.get('redirect_url')
  expect(redirect).toBe('/result?task=chat&budget=any&skill=beginner')
})

test('an all-matches result ends with the Daily Bot', async ({ page }) => {
  await page.goto('/result?task=chat&view=all')
  const region = dailyBot(page)
  await expect(region).toHaveCount(1)
  await expectBelow(page.getByRole('navigation', { name: 'Pages' }), region)
})

test('a best page ends with the Daily Bot', async ({ page }) => {
  await page.goto('/best/coding')
  const region = dailyBot(page)
  await expect(region).toHaveCount(1)
  await expectBelow(page.getByText('Want this personalized?'), region)
})

test('a compare page ends with the Daily Bot', async ({ page }) => {
  await page.goto('/compare/cursor-vs-github-copilot')
  const region = dailyBot(page)
  await expect(region).toHaveCount(1)
  await expectBelow(page.getByRole('heading', { name: /deep dive/ }), region)
})

test('newsletter_signup waits for analytics consent and does not include the email', async ({ page }) => {
  await page.addInitScript(() => {
    const analyticsWindow = window as AnalyticsWindow
    analyticsWindow.__gaEvents = []
    analyticsWindow.gtag = (...args: unknown[]) => {
      analyticsWindow.__gaEvents?.push(args)
    }
  })
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname.toLowerCase()
    if (host.includes('google') || host.includes('gstatic')) return route.abort()
    return route.continue()
  })

  await page.goto('/newsletter')
  const email = `daily-bot-${Date.now()}@example.com`
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Get the daily digest' }).click()
  await expect(page.getByRole('status')).toHaveText("You'll get a confirmation email when The Daily Bot launches.")

  const before = await page.evaluate(() => (window as AnalyticsWindow).__gaEvents ?? [])
  expect(before.filter((entry) => entry[1] === 'newsletter_signup')).toEqual([])

  await page.getByRole('button', { name: 'Accept analytics' }).click()
  await expect.poll(async () => {
    const events = await page.evaluate(() => (window as AnalyticsWindow).__gaEvents ?? [])
    return events.filter((entry) => entry[1] === 'newsletter_signup').length
  }).toBe(1)

  const after = await page.evaluate(() => (window as AnalyticsWindow).__gaEvents ?? [])
  const signup = after.filter((entry) => entry[1] === 'newsletter_signup')
  expect(JSON.stringify(signup)).not.toContain(email)
  expect(JSON.stringify(signup)).not.toContain('@')
})
