import { expect, test } from '@playwright/test'
import { toolSeeds } from '../src/data/catalog'
import { TOOLS_PAGE_SIZE } from '../src/lib/catalog-read'
import { categorySlug, toolCategories } from '../src/lib/tool-index'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = catalogFromSeeds()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TOOLS_PAGE_SIZE))
}

test('lists a page of catalog tools and links to the next page', async ({ page }) => {
  const ordered = [...catalog.tools].sort((a, b) => a.name.localeCompare(b.name))
  const first = ordered[0]
  expect(first).toBeTruthy()
  if (!first) return
  const pages = pageCount(ordered.length)

  await page.goto('/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools')
  await expect(page).toHaveTitle('Tools · BestBotFor')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Get the right AI in 30 seconds/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/tools$/)
  await expect(page.getByText(`${ordered.length} tools. Page 1 of ${pages}.`)).toBeVisible()

  const tools = page.getByRole('list', { name: 'Tools' }).getByRole('listitem')
  await expect(tools).toHaveCount(Math.min(TOOLS_PAGE_SIZE, ordered.length))
  await expect(page.getByRole('link', { name: first.name, exact: true })).toHaveAttribute('href', `/tools/${first.slug}`)

  if (pages > 1) {
    await page.getByRole('link', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/\/tools\?page=2$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools')
    const second = ordered[TOOLS_PAGE_SIZE]
    expect(second).toBeTruthy()
    if (!second) return
    await expect(page.getByRole('link', { name: second.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: first.name, exact: true })).toHaveCount(0)
  }
})

test('filters by a catalog category with a shareable URL and without JavaScript', async ({ browser }) => {
  const category = toolCategories(catalog.tools)[0]
  expect(category).toBeTruthy()
  if (!category) return
  const expected = catalog.tools
    .filter((tool) => categorySlug(tool.category) === category.slug)
    .sort((a, b) => a.name.localeCompare(b.name))
  const pages = pageCount(expected.length)

  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('/tools')
    await page
      .getByRole('navigation', { name: 'Filter by category' })
      .getByRole('link', { name: new RegExp(`^${escapeRegExp(category.name)}`) })
      .click()
    await expect(page).toHaveURL(new RegExp(`/tools\\?category=${category.slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools')
    await expect(page).toHaveTitle(`${category.name} tools · BestBotFor`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/tools\\?category=${category.slug}$`))
    await expect(page.getByText(`${expected.length} ${category.name} tools. Page 1 of ${pages}.`)).toBeVisible()
    await expect(page.getByRole('list', { name: 'Tools' }).getByRole('listitem')).toHaveCount(
      Math.min(TOOLS_PAGE_SIZE, expected.length),
    )
    await expect(page.getByRole('link', { name: expected[0]?.name ?? '', exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('each real tools page has its own canonical, and pages past the end are 404', async ({ page, request }) => {
  const pages = pageCount(catalog.tools.length)
  expect(pages).toBeGreaterThan(1)
  expect(pages).toBeLessThan(8)

  await page.goto('/tools')
  const firstCanonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(firstCanonical).toMatch(/\/tools$/)

  await page.goto('/tools?page=1')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', firstCanonical ?? '')

  await page.goto('/tools?page=2')
  const secondCanonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(secondCanonical).toMatch(/\/tools\?page=2$/)
  expect(secondCanonical).not.toBe(firstCanonical)

  const categories = toolCategories(catalog.tools)
  const firstCategory = categories[0]
  const secondCategory = categories[1]
  expect(firstCategory && secondCategory).toBeTruthy()
  if (!firstCategory || !secondCategory) return

  await page.goto(`/tools?category=${firstCategory.slug}`)
  const categoryCanonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(categoryCanonical).toMatch(new RegExp(`/tools\\?category=${firstCategory.slug}$`))
  expect(categoryCanonical).not.toBe(firstCanonical)
  expect(categoryCanonical).not.toBe(secondCanonical)

  await page.goto(`/tools?category=${secondCategory.slug}`)
  const otherCategoryCanonical = await page.locator('link[rel="canonical"]').getAttribute('href')
  expect(otherCategoryCanonical).toMatch(new RegExp(`/tools\\?category=${secondCategory.slug}$`))
  expect(otherCategoryCanonical).not.toBe(categoryCanonical)

  const pastLast = [
    `/tools?page=${pages + 1}`,
    '/tools?page=8',
    '/tools?page=99',
    '/tools?page=0',
    '/tools?page=-1',
    '/tools?page=abc',
    '/tools?page=1.5',
    '/tools?page=01',
  ]
  for (const category of categories) {
    const categoryPages = pageCount(category.count)
    pastLast.push(`/tools?category=${category.slug}&page=${categoryPages + 1}`)
    pastLast.push(`/tools?category=${category.slug}&page=99`)
    if (categoryPages > 1) {
      await page.goto(`/tools?category=${category.slug}&page=2`)
      const href = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(href).toContain(`category=${category.slug}`)
      expect(href).toContain('page=2')
      expect(href).not.toBe(categoryCanonical)
      expect(href).not.toBe(secondCanonical)
    }
  }

  for (const path of pastLast) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const body = await response.text()
    expect(body, path).not.toMatch(/<link rel="canonical" href="[^"]*[?&]page=/)
  }
})

test('an unknown category does not echo the query', async ({ page }) => {
  const unknown = 'not-a-real-category'
  expect(toolCategories(catalog.tools).some((category) => category.slug === unknown)).toBe(false)
  await page.goto(`/tools?category=${unknown}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tools')
  await expect(page.getByText('That category is not in the catalog.')).toBeVisible()
  await expect(page.getByText(unknown)).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.getByRole('list', { name: 'Tools' })).toHaveCount(0)
})

test('best, compare, tool profiles, and the sitemap follow the seed', async ({ page, request }) => {
  const { comparePairSeeds } = await import('../src/data/catalog')
  const { toolsForTask } = await import('../src/lib/recommend')
  const task = catalog.tasks.find((item) => item.slug === 'coding')
  const ranked = toolsForTask(catalog, 'coding')
  const top = ranked[0]
  expect(task && top).toBeTruthy()
  if (!task || !top) return

  await page.goto(`/best/${task.slug}`)
  await expect(page).toHaveTitle('Best AI for writing code · BestBotFor')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Best AI for writing code | BestBotFor')
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'Best AI for writing code | BestBotFor')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Best AI tool for writing code')
  await expect(page.getByText(`The best AI tool for writing code is ${top.name}.`)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Best for writing code')
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

  const profile = toolSeeds[toolSeeds.length - 1]
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
