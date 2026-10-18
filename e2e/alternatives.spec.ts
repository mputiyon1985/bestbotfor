import { expect, test } from '@playwright/test'
import { ALTERNATIVE_PAGES, comparePairsFor, rankAlternatives } from '../src/lib/alternatives'
import { toolsForTask } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

test.describe('alternatives pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
  })

  for (const spec of ALTERNATIVE_PAGES) {
    test(`/alternatives/${spec.tool} ranks live alternatives without the tool`, async ({ page }) => {
      const tool = catalog.tools.find((item) => item.slug === spec.tool)!
      const response = await page.goto(`/alternatives/${spec.tool}`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(`${tool.name} Alternatives: The Best Picks by Budget (2026) · BestBotFor`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${tool.name} alternatives`)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/alternatives/${spec.tool}$`))
      const expected = rankAlternatives(toolsForTask(catalog, spec.task), spec.tool, 'any')
      await expect(page.getByText(`The closest ${tool.name} alternative is ${expected[0]!.name}.`)).toBeVisible()
      const list = page.getByRole('list', { name: `${tool.name} alternatives ranked by fit` })
      await expect(list.locator(':scope > li')).toHaveCount(expected.length)
      for (const alt of expected) await expect(list.getByRole('link', { name: alt.name, exact: true })).toHaveAttribute('href', `/tools/${alt.slug}`)
      await expect(list.getByRole('link', { name: tool.name, exact: true })).toHaveCount(0)
      const headToHead = page.locator('section[aria-labelledby="head-to-head"]')
      for (const [left, right] of comparePairsFor(spec.tool)) {
        await expect(headToHead.locator(`a[href="/compare/${left}-vs-${right}"]`)).toHaveCount(1)
      }
      await expect(page.locator(`a[href="/best/${spec.task}"]`).first()).toBeVisible()
      await expect(page.getByText('Sponsored', { exact: true })).toHaveCount(0)
      await expect(page.locator(`input[name="source"][value="alternatives-${spec.tool}"]`)).toHaveCount(1)
    })
  }

  test('budget chips filter the list and are noindex variants', async ({ page }) => {
    await page.goto('/alternatives/chatgpt')
    await page.getByRole('navigation', { name: 'Budget' }).getByRole('link', { name: 'Free only' }).click()
    await expect(page).toHaveURL(/\/alternatives\/chatgpt\?budget=free$/)
    await expect(page.getByRole('navigation', { name: 'Budget' }).getByRole('link', { name: 'Free only' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/alternatives\/chatgpt$/)
    const expected = rankAlternatives(toolsForTask(catalog, 'chat'), 'chatgpt', 'free')
    const list = page.getByRole('list', { name: 'ChatGPT alternatives ranked by fit' })
    await expect(list.locator(':scope > li')).toHaveCount(expected.length)
  })

  test('unknown tools and budgets are a 404, and profiles link the page', async ({ page }) => {
    expect((await page.goto('/alternatives/notion-ai'))?.status()).toBe(404)
    expect((await page.goto('/alternatives/chatgpt?budget=cheap'))?.status()).toBe(404)
    await page.goto('/tools/chatgpt')
    await expect(page.getByRole('link', { name: 'Alternatives to ChatGPT' })).toHaveAttribute('href', '/alternatives/chatgpt')
    await page.goto('/best/chat')
    await expect(page.getByRole('navigation', { name: 'More guides' }).getByRole('link', { name: 'ChatGPT alternatives' })).toHaveAttribute('href', '/alternatives/chatgpt')
  })

  test('the sitemap lists all five', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text()
    for (const spec of ALTERNATIVE_PAGES) expect(body).toContain(`/alternatives/${spec.tool}</loc>`)
  })
})
