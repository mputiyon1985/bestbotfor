import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator } from '@playwright/test'
import { comparePairSeeds, toolSeeds } from '../src/data/catalog'
import { TOOL_LOGO_MARK_FILL, TOOL_LOGO_SIZE } from '../src/lib/logo-source'
import { BEST_GUIDE_TOOL_COUNT } from '../src/lib/descriptions'
import { MATCHES_PAGE_SIZE, MATCHES_SKILL, matchesPath } from '../src/lib/matches'
import { toolsForTask } from '../src/lib/recommend'
import { isQuizMatchable, rankTools } from '../src/lib/scoring'
import { categorySlug, toolCategories } from '../src/lib/tool-index'
import { listedCatalogFromSeeds } from '../src/test/catalog-from-seeds'

const catalog = listedCatalogFromSeeds()

// Mirrors TOOLS_PAGE_SIZE in src/lib/catalog-read.ts, which imports 'server-only'
// and cannot load in Playwright. src/lib/catalog-read.test.ts pins the value.
const TOOLS_PAGE_SIZE = 24

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / TOOLS_PAGE_SIZE))
}

/**
 * Listed tools, counted from the catalog source files. This does not call
 * `pageCount` or read the directory UI, so a page-count assert can compare
 * the rendered pagination against ceil(n / TOOLS_PAGE_SIZE).
 */
/** Best-guide card, or the all-matches card when the tool ranks past the guide. */
function rankedCardPath(slug: string): string | null {
  for (const task of catalog.tasks) {
    const ranked = toolsForTask(catalog, task.slug)
    const index = ranked.findIndex((tool) => tool.slug === slug)
    if (index >= 0 && index < BEST_GUIDE_TOOL_COUNT) return `/best/${task.slug}`
  }
  for (const task of catalog.tasks) {
    const ranked = toolsForTask(catalog, task.slug).filter((tool) =>
      isQuizMatchable({ slug: tool.slug, fitScore: tool.fitScore, quizEligible: tool.quizEligible, editorial: tool.editorial }),
    )
    const ordered = rankTools(ranked, { budget: 'any', skill: MATCHES_SKILL })
    const index = ordered.findIndex((tool) => tool.slug === slug)
    if (index === -1) continue
    return matchesPath(task.slug, 'any', Math.floor(index / MATCHES_PAGE_SIZE) + 1)
  }
  return null
}

function listedToolCountFromCatalogFiles(): number {
  const files = ['src/data/catalog.ts', 'src/data/music-seo.ts']
  let slugs = 0
  let unlisted = 0
  for (const file of files) {
    const lines = readFileSync(path.join(process.cwd(), file), 'utf8').split('\n')
    slugs += lines.filter((line) => /^ {4}slug: /.test(line)).length
    unlisted += lines.filter((line) => /^ {4}unlisted: true,?/.test(line)).length
  }
  return slugs - unlisted
}

test('lists a page of catalog tools and links to the next page', async ({ page }) => {
  // The page orders by tools.name in SQL (SQLite BINARY collation: code-unit order, so
  // lowercase-first names such as myPip sort after the capitalized ones).
  const ordered = [...catalog.tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
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
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
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
  // n comes from the catalog files. The page count comes from the directory UI, not from pageCount().
  const listed = listedToolCountFromCatalogFiles()
  const expectedPages = Math.ceil(listed / TOOLS_PAGE_SIZE)
  expect(expectedPages).toBeGreaterThan(1)

  await page.goto('/tools')
  const summary = page.getByText(/\d+ tools\. Page 1 of \d+\./)
  await expect(summary).toBeVisible()
  const renderedPages = Number(/Page 1 of (\d+)\./.exec((await summary.innerText()) ?? '')?.[1])
  expect(renderedPages, 'pages rendered by the directory').toBe(expectedPages)
  const lastPage = await request.get(`/tools?page=${renderedPages}`)
  expect(lastPage.status()).toBe(200)
  const pages = renderedPages

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

async function markFill(logo: Locator): Promise<number | null> {
  return logo.evaluate(async (element) => {
    if (!(element instanceof HTMLImageElement)) return null
    const current = element.currentSrc || element.src
    const parsed = new URL(current, window.location.href)
    const original = parsed.searchParams.get('url') || parsed.pathname
    const probe = new Image()
    probe.src = original
    await probe.decode()
    const width = probe.naturalWidth
    const height = probe.naturalHeight
    if (width === 0 || height === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(probe, 0, 0)
    const { data } = context.getImageData(0, 0, width, height)
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4
        const red = data[index] ?? 0
        const green = data[index + 1] ?? 0
        const blue = data[index + 2] ?? 0
        const alpha = data[index + 3] ?? 0
        if (alpha < 16) continue
        if (red > 246 && green > 246 && blue > 246) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
    if (maxX < minX || maxY < minY) return null
    return Math.max(maxX - minX + 1, maxY - minY + 1) / Math.max(width, height)
  })
}

function insideViewport(box: { x: number; y: number; width: number; height: number }, viewport: { width: number; height: number }): boolean {
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1
}

test('a tool card and an 80% logo mark fit the first 390px viewport', async ({ page }) => {
  const viewport = { width: 390, height: 844 }
  await page.setViewportSize(viewport)
  await page.goto('/tools')

  // The first card with a hosted logo (a monogram-only tool, such as 1Password for Agents, can sort first).
  const card = page.getByRole('list', { name: 'Tools' }).getByRole('listitem').filter({ has: page.locator('img') }).first()
  await expect(card).toBeVisible()
  const cardBox = await card.boundingBox()
  expect(cardBox, 'first tool card').not.toBeNull()
  if (!cardBox) return
  expect(insideViewport(cardBox, viewport), `card at y=${cardBox.y}`).toBe(true)

  const logo = card.getByRole('img')
  await expect(logo).toBeVisible()
  const tile = await logo.boundingBox()
  expect(tile, 'logo tile').not.toBeNull()
  if (!tile) return
  expect(tile.width).toBeGreaterThanOrEqual(TOOL_LOGO_SIZE - 1)
  expect(tile.width).toBeLessThanOrEqual(TOOL_LOGO_SIZE + 1)
  expect(insideViewport(tile, viewport)).toBe(true)
  const fill = await markFill(logo)
  expect(fill, 'logo mark fill').not.toBeNull()
  if (fill === null) return
  expect(fill).toBeGreaterThanOrEqual(TOOL_LOGO_MARK_FILL - 0.05)
  expect(fill).toBeLessThanOrEqual(TOOL_LOGO_MARK_FILL + 0.05)
  const renderedMark = fill * tile.width
  expect(renderedMark).toBeGreaterThanOrEqual(tile.width * (TOOL_LOGO_MARK_FILL - 0.05))
  expect(renderedMark).toBeLessThanOrEqual(tile.width * (TOOL_LOGO_MARK_FILL + 0.05))

  await page.evaluate(() => document.fonts.ready)
  const monogram = page.getByRole('list', { name: 'Tools' }).locator('span[role="img"]').first()
  await expect(monogram).toBeVisible()
  const monogramSize = await monogram.evaluate((element) => {
    const tile = element.getBoundingClientRect()
    const letter = element.querySelector('span')
    if (!letter) return null
    const range = document.createRange()
    range.selectNodeContents(letter)
    const ink = range.getBoundingClientRect()
    return { tile: tile.width, mark: Math.max(ink.width, ink.height) }
  })
  expect(monogramSize).not.toBeNull()
  if (!monogramSize) return
  expect(monogramSize.tile).toBeGreaterThanOrEqual(TOOL_LOGO_SIZE - 1)
  expect(monogramSize.mark / monogramSize.tile).toBeGreaterThanOrEqual(TOOL_LOGO_MARK_FILL - 0.05)
  expect(monogramSize.mark / monogramSize.tile).toBeLessThanOrEqual(TOOL_LOGO_MARK_FILL + 0.05)

  const nav = page.getByRole('navigation', { name: 'Filter by category' })
  await expect(nav).toBeVisible()
  const chips = nav.getByRole('link')
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(1)
  const firstChip = await chips.first().boundingBox()
  const lastChip = await chips.nth(chipCount - 1).boundingBox()
  expect(firstChip && lastChip).toBeTruthy()
  if (!firstChip || !lastChip) return
  expect(Math.abs(firstChip.y - lastChip.y)).toBeLessThanOrEqual(2)
  expect(firstChip.height).toBeGreaterThanOrEqual(44)
  expect(lastChip.height).toBeGreaterThanOrEqual(44)

  await chips.nth(chipCount - 2).focus()
  await page.keyboard.press('Tab')
  await expect(chips.nth(chipCount - 1)).toBeFocused()
  const focused = await chips.nth(chipCount - 1).evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  })
  expect(focused.outlineStyle).not.toBe('none')
  expect(focused.outlineWidth).toBeGreaterThanOrEqual(2)
  expect(focused.left).toBeGreaterThanOrEqual(-1)
  expect(focused.right).toBeLessThanOrEqual(focused.width + 1)
  expect(focused.top).toBeGreaterThanOrEqual(-1)
  expect(focused.bottom).toBeLessThanOrEqual(focused.height + 1)

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('category chips still wrap on a desktop tools page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/tools')
  const chips = page.getByRole('navigation', { name: 'Filter by category' }).getByRole('link')
  const count = await chips.count()
  expect(count).toBeGreaterThan(1)
  const first = await chips.first().boundingBox()
  const last = await chips.nth(count - 1).boundingBox()
  expect(first && last).toBeTruthy()
  if (!first || !last) return
  expect(last.y).toBeGreaterThan(first.y + 20)
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

test('annual-billed tools show a monthly rate on the card, the tool page, and the meta description', async ({ page }) => {
  const cases = [
    { slug: 'agentspot', name: 'AgentSpot', price: 'Free tier, then $1,650/mo and up, billed annually' },
    { slug: 'perplexity', name: 'Perplexity', price: 'Free tier, then $17/mo and up, billed annually' },
    { slug: 'lalal-ai', name: 'LALAL.AI', price: 'Free tier, then $7.50/mo and up, billed annually' },
  ] as const

  for (const item of cases) {
    await page.goto(`/tools/${item.slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.name)
    await expect(page.getByText(item.price, { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByText('Yes', { exact: true }).filter({ visible: true }).first()).toBeVisible()
    const description = (await page.locator('meta[name="description"]').getAttribute('content')) ?? ''
    expect(description, item.slug).toContain(item.price)
    expect(description.length, item.slug).toBeLessThanOrEqual(160)
    const cut = description.indexOf('…')
    if (cut !== -1) {
      const tool = catalog.tools.find((entry) => entry.slug === item.slug)
      const lead = `${item.name} by ${tool?.vendor}: ${tool?.shortDesc.trim().replace(/\.?$/, '.')}`
      const before = description.slice(0, cut)
      expect(lead.startsWith(before), item.slug).toBe(true)
      expect(lead[before.length], `${item.slug} meta cut mid-word`).toMatch(/\s/)
    }

    const cardPath = rankedCardPath(item.slug)
    if (!cardPath) {
      expect(toolSeeds.find((tool) => tool.slug === item.slug)?.fits, item.slug).toEqual([])
      continue
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(cardPath)
    const card = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: item.name, exact: true }) })
    await expect(card.getByText(item.price, { exact: true })).toBeVisible()
    if (cardPath.startsWith('/best/')) {
      await page.setViewportSize({ width: 1280, height: 900 })
      await expect(page.locator('table').getByText(item.price, { exact: true })).toBeVisible()
    }
  }
})

test('best, compare, tool profiles, and the sitemap follow the seed', async ({ page, request }) => {
  const task = catalog.tasks.find((item) => item.slug === 'coding')
  const ranked = toolsForTask(catalog, 'coding')
  const top = ranked[0]
  expect(task && top).toBeTruthy()
  if (!task || !top) return

  await page.goto(`/best/${task.slug}`)
  await expect(page).toHaveTitle('Best AI for coding (2026): Our Pick + Free Options')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Best AI for coding (2026): Our Pick + Free Options | BestBotFor')
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'Best AI for coding (2026): Our Pick + Free Options | BestBotFor')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Best AI tool for writing code')
  await expect(page.getByText(`The best AI tool for writing code is ${top.name}.`)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Best for writing code')
  for (const tool of ranked.slice(0, BEST_GUIDE_TOOL_COUNT)) {
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
