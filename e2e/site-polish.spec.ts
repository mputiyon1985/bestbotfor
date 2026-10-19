import { expect, test } from '@playwright/test'
import { taskSeeds } from '../src/data/catalog'

test('the footer links our Facebook, X and LinkedIn profiles accessibly', async ({ page }) => {
  await page.goto('/')
  const follow = page.getByRole('contentinfo').getByRole('navigation', { name: 'Follow BestBotFor' })
  await expect(follow.getByRole('heading', { name: 'Follow' })).toBeVisible()
  const expected = [
    ['BestBotFor on Facebook', 'https://www.facebook.com/profile.php?id=61595073856208'],
    ['BestBotFor on X', 'https://x.com/bestbotfor'],
    ['BestBotFor on LinkedIn', 'https://www.linkedin.com/company/bestbotfor'],
  ] as const
  await expect(follow.getByRole('link')).toHaveCount(expected.length)
  for (const [name, href] of expected) {
    const link = follow.getByRole('link', { name, exact: true })
    await expect(link).toHaveAttribute('href', href)
    await expect(link).toHaveAttribute('rel', 'noopener me')
    await expect(link).not.toHaveAttribute('target', /.+/)
  }
})

test('the sitemap drops match lists and dates every entry', async ({ request }) => {
  const body = await (await request.get('/sitemap.xml')).text()
  expect(body).not.toContain('/result?')
  expect(body).not.toContain('view=all')
  const urls = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1])
  expect(urls.length).toBeGreaterThan(20)
  for (const url of urls) expect(url).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)
  for (const task of taskSeeds) expect(body).toContain(`/best/${task.slug}</loc>`)
})

test('a match list is noindex and canonicalizes to its /best guide', async ({ page }) => {
  await page.goto('/result?task=writing&view=all')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/writing$/)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  // Non-production servers are noindex, nofollow site-wide; production follow is checked by check:lighthouse.
})

test('/pricing says members are coming soon and offers The Daily Bot while no membership price is set', async ({ page }) => {
  await page.goto('/pricing')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Membership')
  await expect(main.getByText('Members: coming soon. Join The Daily Bot to hear first.')).toBeVisible()
  await expect(main.getByRole('button', { name: 'Get The Daily Bot' })).toBeVisible()
  await expect(main.getByText('Membership billing is not available yet')).toHaveCount(0)
  await expect(main.getByRole('button', { name: 'Continue to checkout' })).toHaveCount(0)
  await expect(main.getByRole('link', { name: 'Sign in to subscribe' })).toHaveCount(0)
})

test('/sponsor shows the monthly subscription when its price is configured', async ({ page }) => {
  await page.goto('/sponsor')
  await expect(page.getByRole('radio', { name: /Featured placement, monthly subscription/ })).toBeEnabled()
  await expect(page.getByText('Checkout for this slot is not configured yet.')).toHaveCount(0)
})
