import { expect, test } from '@playwright/test'
import { freePlanNotes } from '../src/data/free-plan-notes'
import { FREE_PAGE_TASKS, FREE_PAGE_TOOL_COUNT } from '../src/lib/free-plan'
import { buildFreePage } from '../src/lib/free-page'
import { toolsForTask } from '../src/lib/recommend'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

test.describe('best free pages', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'bbf_consent', value: 'denied', url: 'http://127.0.0.1:3000' }])
  })

  test('/best/coding/free shows each tool with its note, official source and checked date', async ({ page }) => {
    const response = await page.goto('/best/coding/free')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Best Free AI Tool for Writing Code (2026) · BestBotFor')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Best free AI tool for writing code')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/coding\/free$/)
    // Outside production every page is noindex; the gate itself is checked in the hooks project.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    const list = page.getByRole('list', { name: 'Free tools ranked for writing code' })
    const items = list.getByRole('listitem')
    await expect(items).toHaveCount(FREE_PAGE_TOOL_COUNT)
    const expected = buildFreePage(toolsForTask(catalog, 'coding'), Date.now()).tools
    for (const [index, tool] of expected.entries()) {
      const item = items.nth(index)
      const note = freePlanNotes[tool.slug]
      expect(note, tool.slug).toBeTruthy()
      if (!note) continue
      await expect(item.getByRole('link', { name: tool.name, exact: true })).toHaveAttribute('href', `/tools/${tool.slug}`)
      await expect(item).toContainText(note.freePlanNote)
      await expect(item.getByRole('link', { name: `${tool.name} pricing` })).toHaveAttribute('href', note.freePlanSource)
      await expect(item.locator('time')).toHaveAttribute('datetime', note.freePlanCheckedAt)
    }
    await expect(page.getByRole('link', { name: 'See every free match' })).toHaveAttribute('href', '/result?task=coding&view=all&budget=free')
    await expect(page.getByText('Sponsored', { exact: true })).toHaveCount(0)
  })

  test('each /best/[task] guide with a free page links to it', async ({ page }) => {
    for (const task of FREE_PAGE_TASKS) {
      await page.goto(`/best/${task}`)
      await expect(page.getByRole('link', { name: 'Only want free tools?' })).toHaveAttribute('href', `/best/${task}/free`)
    }
    await page.goto('/best/writing')
    await expect(page.getByRole('link', { name: 'Only want free tools?' })).toHaveCount(0)
  })

  test('jobs without a free page are a noindex 404', async ({ page }) => {
    for (const path of ['/best/writing/free', '/best/not-a-job/free', '/best/coding/free/extra']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })
})
