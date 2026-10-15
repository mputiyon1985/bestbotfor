import { expect, test, type Page } from '@playwright/test'
import { comparePairSeeds } from '../src/data/catalog'
import { toolsForTask } from '../src/lib/recommend'
import { filterTools, toolCategories } from '../src/lib/tool-index'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function itemListNames(page: Page): Promise<string[]> {
  const payloads = await page.locator('script[type="application/ld+json"]').allTextContents()
  const itemList = payloads
    .map((payload) => JSON.parse(payload) as { '@type'?: string; itemListElement?: { name: string }[] })
    .find((data) => data['@type'] === 'ItemList')
  return itemList?.itemListElement?.map((item) => item.name) ?? []
}

test('lists every catalog tool with metadata and an item list', async ({ page }) => {
  const ordered = [...catalog.tools].sort((a, b) => a.name.localeCompare(b.name))
  const first = ordered[0]
  expect(first).toBeTruthy()
  if (!first) return

  await page.goto('/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI tools')
  await expect(page).toHaveTitle('AI tools · BestBotFor')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Every AI tool in the BestBotFor catalog/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/tools$/)
  await expect(page.getByText(`Showing ${catalog.tools.length} of ${catalog.tools.length} tools.`)).toBeVisible()

  const tools = page.getByRole('list', { name: 'Tools' }).getByRole('listitem')
  await expect(tools).toHaveCount(catalog.tools.length)
  await expect(page.getByRole('link', { name: first.name, exact: true })).toHaveAttribute('href', `/tools/${first.slug}`)
  expect(await itemListNames(page)).toEqual(ordered.map((tool) => tool.name))
})

test('filters by a catalog category with a shareable URL and without JavaScript', async ({ browser }) => {
  const category = toolCategories(catalog.tools)[0]
  expect(category).toBeTruthy()
  if (!category) return
  const expected = filterTools(catalog.tools, category)

  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('/tools')
    await page
      .getByRole('navigation', { name: 'Filter by category' })
      .getByRole('link', { name: new RegExp(`^${escapeRegExp(category.name)}`) })
      .click()
    await expect(page).toHaveURL(new RegExp(`/tools\\?category=${category.slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${category.name} tools`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/tools\\?category=${category.slug}$`))
    await expect(page.getByText(`Showing ${expected.length} of ${catalog.tools.length} tools.`)).toBeVisible()
    await expect(page.getByRole('list', { name: 'Tools' }).getByRole('listitem')).toHaveCount(expected.length)
    expect(await itemListNames(page)).toEqual(expected.map((tool) => tool.name))
  } finally {
    await context.close()
  }
})

test('an unknown category does not echo the query', async ({ page }) => {
  const unknown = 'not-a-real-category'
  expect(toolCategories(catalog.tools).some((category) => category.slug === unknown)).toBe(false)
  await page.goto(`/tools?category=${unknown}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI tools')
  await expect(page.getByText('That category is not in the catalog.')).toBeVisible()
  await expect(page.getByText(unknown)).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('best, compare, tool profiles, and the sitemap follow the seed', async ({ page, request }) => {
  const task = catalog.tasks.find((item) => item.slug === 'coding')
  const ranked = toolsForTask(catalog, 'coding')
  const top = ranked[0]
  expect(task && top).toBeTruthy()
  if (!task || !top) return

  await page.goto(`/best/${task.slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Best AI tool for ${task.name.toLowerCase()}`)
  await expect(page.getByText(`The best AI tool for ${task.name.toLowerCase()} is ${top.name}.`)).toBeVisible()
  for (const tool of ranked.slice(0, 5)) {
    await expect(page.getByRole('link', { name: tool.name, exact: true })).toBeVisible()
  }

  const pair = comparePairSeeds[0]
  expect(pair).toBeTruthy()
  if (!pair) return
  const [leftSlug, rightSlug] = pair
  const left = catalog.tools.find((tool) => tool.slug === leftSlug)
  const right = catalog.tools.find((tool) => tool.slug === rightSlug)
  expect(left && right).toBeTruthy()
  if (!left || !right) return
  await page.goto(`/compare/${left.slug}-vs-${right.slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${left.name} vs ${right.name}`)

  const profile = catalog.tools[catalog.tools.length - 1]
  expect(profile).toBeTruthy()
  if (!profile) return
  await page.goto(`/tools/${profile.slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(profile.name)
  await expect(page.getByRole('link', { name: `Visit ${profile.name}` })).toHaveAttribute('href', `/go/${profile.slug}`)

  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).toContain('/tools</loc>')
  for (const tool of catalog.tools) expect(body).toContain(`/tools/${tool.slug}</loc>`)
  for (const item of catalog.tasks) expect(body).toContain(`/best/${item.slug}</loc>`)
  for (const [a, b] of comparePairSeeds) expect(body).toContain(`/compare/${a}-vs-${b}</loc>`)
})
