import { expect, test } from '@playwright/test'
import { listedCatalogFromSeeds } from '../src/test/catalog-from-seeds'
import { listMatches, MATCHES_PAGE_SIZE, matchesPath, seeAllMatchesLabel } from '../src/lib/matches'
import { paginationItems, showingLabel } from '../src/lib/pagination'
import type { ScoreableTool } from '../src/lib/scoring'

function candidates(task: string): ScoreableTool[] {
  return listedCatalogFromSeeds().tools.flatMap((tool) => {
    const fit = tool.fits.find((item) => item.taskSlug === task)
    if (!fit) return []
    return [
      {
        slug: tool.slug,
        name: tool.name,
        skillLevel: tool.skillLevel,
        pricingModel: tool.pricingModel,
        hasFreeTier: tool.hasFreeTier,
        priceFromUsd: tool.priceFromUsd,
        fitScore: fit.score,
        notes: fit.notes,
        quizEligible: tool.quizEligible,
      },
    ]
  })
}

test('the quiz links to every match and the pages stay in rank order', async ({ page }) => {
  const matches = listMatches(candidates('chat'), 'any')
  expect(matches.length).toBeGreaterThan(MATCHES_PAGE_SIZE)
  const first = pageOf(matches, 1)
  const second = pageOf(matches, 2)

  await page.goto('/result?task=chat&budget=any&skill=beginner')
  await page.getByRole('link', { name: seeAllMatchesLabel(matches.length) }).click()
  await expect(page).toHaveURL(/\/result\?task=chat&view=all$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chat and brainstorm matches')
  await expect(page).toHaveTitle('Chat and brainstorm matches · BestBotFor')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/chat$/)
  await expect(page.locator('link[rel="next"]')).toHaveAttribute('href', /\/result\?task=chat&view=all&page=2$/)
  await expect(page.locator('link[rel="prev"]')).toHaveCount(0)

  await expect(page.getByText(showingLabel(1, MATCHES_PAGE_SIZE, matches.length))).toBeVisible()
  const pages = page.getByRole('navigation', { name: 'Pages' })
  await expect(pages.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/result?task=chat&view=all&page=2')

  const list = page.getByRole('list', { name: 'Matches' })
  await expect(list.getByRole('listitem')).toHaveCount(MATCHES_PAGE_SIZE)
  for (const tool of first) {
    const item = list.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: tool.name, exact: true }) })
    await expect(item.getByText(tool.notes)).toBeVisible()
  }
  await expect(list.getByRole('heading', { level: 2, name: second[0]?.name ?? '', exact: true })).toHaveCount(0)

  await page.getByRole('link', { name: 'Next page' }).click()
  await expect(page).toHaveURL(/\/result\?task=chat&view=all&page=2$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/chat$/)
  await expect(page.locator('link[rel="prev"]')).toHaveAttribute('href', /\/result\?task=chat&view=all$/)
  await expect(page.getByText(showingLabel(2, MATCHES_PAGE_SIZE, matches.length))).toBeVisible()
  const pageTwo = page.getByRole('list', { name: 'Matches' })
  await expect(pageTwo.getByRole('listitem')).toHaveCount(second.length)
  await expect(pageTwo.getByRole('heading', { level: 2, name: second[0]?.name ?? '', exact: true })).toBeVisible()
  await expect(pageTwo.getByRole('heading', { level: 2, name: first[0]?.name ?? '', exact: true })).toHaveCount(0)
})

test('the see-all link keeps the quiz budget', async ({ page }) => {
  const free = listMatches(candidates('music'), 'free')
  const low = listMatches(candidates('music'), 'low')
  expect(free.length).toBeGreaterThan(0)
  expect(low.length).toBeGreaterThan(free.length)

  await page.goto('/result?task=music&budget=free&skill=beginner')
  await expect(page.getByRole('link', { name: seeAllMatchesLabel(free.length) })).toHaveAttribute(
    'href',
    matchesPath('music', 'free', 1),
  )

  await page.goto('/result?task=music&budget=low&skill=beginner')
  await expect(page.getByRole('link', { name: seeAllMatchesLabel(low.length) })).toHaveAttribute(
    'href',
    matchesPath('music', 'low', 1),
  )
  await expect(page).toHaveTitle(/Make music: /)
})

test('a budget filter is a real link and canonicalizes to the task guide', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    const free = listMatches(candidates('music'), 'free')
    const low = listMatches(candidates('music'), 'low')
    expect(free.some((tool) => tool.slug === 'soundraw')).toBe(false)
    expect(low.some((tool) => tool.slug === 'soundraw')).toBe(true)

    await page.goto(matchesPath('music', 'any', 1))
    await page.getByRole('navigation', { name: 'Filter by budget' }).getByRole('link', { name: 'Free only' }).click()
    await expect(page).toHaveURL(/\/result\?task=music&view=all&budget=free$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make music matches, free only')
    await expect(page).toHaveTitle('Make music matches, free only · BestBotFor')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/music$/)
    await expect(page.getByRole('heading', { level: 2, name: 'SOUNDRAW', exact: true })).toHaveCount(0)

    await page.goto(matchesPath('music', 'low', 1))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/music$/)
    await expect(page.getByRole('heading', { level: 2, name: 'SOUNDRAW', exact: true })).toBeVisible()

    const codingLow = listMatches(candidates('coding'), 'low')
    expect(codingLow.length).toBeGreaterThan(MATCHES_PAGE_SIZE)
    await page.goto(matchesPath('coding', 'low', 2))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/coding$/)
    await expect(page.locator('link[rel="prev"]')).toHaveAttribute('href', /\/result\?task=coding&view=all&budget=low$/)
  } finally {
    await context.close()
  }
})

test('numbered pages cover the ends and the last page', async ({ page }) => {
  const matches = listMatches(candidates('coding'), 'any')
  const pageCount = Math.ceil(matches.length / MATCHES_PAGE_SIZE)
  expect(pageCount).toBeGreaterThan(1)
  const firstWindow = paginationItems(1, pageCount)

  await page.goto(matchesPath('coding', 'any', 1))
  await expect(page.getByText(showingLabel(1, MATCHES_PAGE_SIZE, matches.length))).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Pages' })
  for (const item of firstWindow) {
    if (item === 'ellipsis') await expect(nav.getByText('…', { exact: true }).first()).toBeVisible()
    else await expect(nav.getByRole('link', { name: `Page ${item}` })).toHaveAttribute('href', matchesPath('coding', 'any', item))
  }

  await nav.getByRole('link', { name: `Page ${pageCount}` }).click()
  await expect(page).toHaveURL(new RegExp(`/result\\?task=coding&view=all&page=${pageCount}$`))
  await expect(page.getByText(showingLabel(pageCount, MATCHES_PAGE_SIZE, matches.length))).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/coding$/)
  await expect(page.locator('link[rel="prev"]')).toHaveAttribute('href', new RegExp(`/result\\?task=coding&view=all&page=${pageCount - 1}$`))
  await expect(page.locator('link[rel="next"]')).toHaveCount(0)
  const lastWindow = paginationItems(pageCount, pageCount)
  expect(lastWindow[0]).toBe(1)
  expect(lastWindow.at(-1)).toBe(pageCount)
  const lastNav = page.getByRole('navigation', { name: 'Pages' })
  for (const item of lastWindow) {
    if (item === 'ellipsis') await expect(lastNav.getByText('…', { exact: true }).first()).toBeVisible()
    else await expect(lastNav.getByRole('link', { name: `Page ${item}` })).toHaveAttribute('href', matchesPath('coding', 'any', item))
  }
})

test('page=1 shares the unpaged canonical, and bad pages are 404', async ({ page, request }) => {
  await page.goto('/result?task=chat&view=all&page=1')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/chat$/)

  await page.goto('/result?task=chat&view=all&budget=any')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/best\/chat$/)

  const missing = [
    '/result?task=chat&view=all&page=0',
    '/result?task=chat&view=all&page=-1',
    '/result?task=chat&view=all&page=abc',
    '/result?task=chat&view=all&page=1.5',
    '/result?task=chat&view=all&page=01',
    '/result?task=chat&view=all&page=99',
    '/result?task=music&view=all&budget=low&page=2',
    '/result?task=chat&view=all&budget=free&page=99',
    '/result?task=chat&view=all&budget=mid',
    '/result?task=chat&view=all&budget=mid&page=0',
    '/result?task=marketing&budget=any&skill=beginner',
    '/result?task=missing&view=all',
    '/result?task=chat&view=all&budget=nope',
    '/result?task=chat&view=other',
  ]
  for (const path of missing) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const body = await response.text()
    expect(body, path).not.toMatch(/<link rel="canonical" href="[^"]*page=/)
  }
})

test('archived tools stay off the match lists and mid is not a budget filter', async ({ page, request }) => {
  const coding = listMatches(candidates('coding'), 'any')
  const agents = listMatches(candidates('agents'), 'any')
  const automation = listMatches(candidates('automation'), 'any')
  expect(coding.some((tool) => tool.slug === 'roo-code')).toBe(false)
  expect(agents.some((tool) => tool.slug === 'flowise')).toBe(false)
  expect(automation.some((tool) => tool.slug === 'flowise')).toBe(false)
  expect(Math.ceil(coding.length / MATCHES_PAGE_SIZE)).toBeGreaterThanOrEqual(2)
  expect(Math.ceil(automation.length / MATCHES_PAGE_SIZE)).toBeGreaterThanOrEqual(3)

  await page.goto(matchesPath('coding', 'any', 2))
  await expect(page.getByRole('heading', { level: 2, name: 'Roo Code', exact: true })).toHaveCount(0)

  await page.goto(matchesPath('agents', 'any', 1))
  const agentsHtml = await page.content()
  expect(agentsHtml).not.toContain('/tools/flowise')
  expect(agentsHtml).not.toContain('Flowise')
  await expect(page.getByRole('heading', { level: 2, name: 'Flowise', exact: true })).toHaveCount(0)

  await page.goto(matchesPath('automation', 'any', 3))
  const automationHtml = await page.content()
  expect(automationHtml).not.toContain('/tools/flowise')
  expect(automationHtml).not.toContain('Flowise')

  const filters = page.getByRole('navigation', { name: 'Filter by budget' })
  await expect(filters.getByRole('link', { name: 'Low cost' })).toBeVisible()
  await expect(filters.getByRole('link', { name: 'Mid cost' })).toHaveCount(0)

  const mid = await request.get('/result?task=chat&view=all&budget=mid')
  expect(mid.status()).toBe(404)

  for (const slug of ['roo-code', 'flowise']) {
    const response = await page.goto(`/tools/${slug}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByText('Unmaintained (repo archived)')).toBeVisible()
  }
})

function pageOf<T>(items: T[], page: number): T[] {
  const start = (page - 1) * MATCHES_PAGE_SIZE
  return items.slice(start, start + MATCHES_PAGE_SIZE)
}
