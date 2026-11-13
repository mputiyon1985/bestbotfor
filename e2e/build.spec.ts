import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

const SESSION_URL = 'https://buy.stripe.com/7sYcN67vW9Kagg2aZmfrW08'
const ADDON_URL = 'https://buy.stripe.com/eVq00kbMc1dE3tgd7ufrW09'

test('/build renders the audit and setup offer with exact Stripe links', async ({ page }) => {
  await page.route('https://buy.stripe.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Stripe</h1></main>' })
  })

  await page.goto('/build')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI Tool Audit + Setup')
  await expect(page).toHaveTitle('AI Tool Audit + Setup · BestBotFor')
  await expect(page.getByText('After checkout, Mark emails you within 1 business day to book your session.')).toBeVisible()
  await expect(page.getByText('Introductory price for our first clients; it will go up.')).toBeVisible()
  await expect(page.getByText(/\d[\d,]* AI tools listed/)).toBeVisible()

  const book = page.getByRole('link', { name: 'Book it — $497' })
  const addon = page.getByRole('link', { name: 'Add a workflow — $197' })
  await expect(book).toHaveAttribute('href', SESSION_URL)
  await expect(addon).toHaveAttribute('href', ADDON_URL)
  await expect(book).toHaveAttribute('rel', 'noopener')
  await expect(addon).toHaveAttribute('rel', 'noopener')

  const html = await page.content()
  expect(html).not.toMatch(/utm/i)
  expect(html).not.toMatch(/\$750|first three|spots left|countdown/i)

  await book.click()
  await expect(page).toHaveURL(SESSION_URL)
  expect(page.url()).not.toMatch(/utm/i)

  await page.goto('/build')
  await page.getByRole('link', { name: 'Add a workflow — $197' }).click()
  await expect(page).toHaveURL(ADDON_URL)
  expect(new URL(page.url()).search).toBe('')

  await page.goto('/build')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('the homepage, footer, and sponsor page link to /build', async ({ page }) => {
  await page.goto('/')
  const home = page.getByRole('main').getByRole('link', { name: 'AI Tool Audit + Setup' })
  await expect(home).toHaveAttribute('href', '/build')
  await home.click()
  await expect(page).toHaveURL(/\/build$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI Tool Audit + Setup')

  await page.goto('/')
  const footer = page.getByRole('contentinfo').getByRole('navigation', { name: 'Company' }).getByRole('link', { name: 'AI setup' })
  await expect(footer).toHaveAttribute('href', '/build')
  await footer.click()
  await expect(page).toHaveURL(/\/build$/)

  await page.goto('/sponsor')
  const sponsor = page.getByRole('main').getByRole('link', { name: 'AI Tool Audit + Setup' })
  await expect(sponsor).toHaveAttribute('href', '/build')
  await sponsor.click()
  await expect(page).toHaveURL(/\/build$/)
})
