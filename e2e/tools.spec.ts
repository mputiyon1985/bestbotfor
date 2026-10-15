import { expect, test } from '@playwright/test'

test('lists every catalog tool with metadata and an item list', async ({ page }) => {
  await page.goto('/tools')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI tools')
  await expect(page).toHaveTitle('AI tools · BestBotFor')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Every AI tool in the BestBotFor catalog/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/tools$/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'AI tools')
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /Every AI tool in the BestBotFor catalog/)
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /\/tools$/)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'AI tools')
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute('content', /Every AI tool in the BestBotFor catalog/)

  const tools = page.getByRole('list', { name: 'Tools' }).getByRole('listitem')
  await expect(tools).toHaveCount(41)
  await expect(page.getByRole('link', { name: 'ChatGPT' })).toHaveAttribute('href', '/tools/chatgpt')
  await expect(page.getByRole('link', { name: 'Scenario' })).toBeVisible()

  const payloads = await page.locator('script[type="application/ld+json"]').allTextContents()
  const itemList = payloads.map((payload) => JSON.parse(payload) as { '@type'?: string; itemListElement?: { name: string }[] }).find((data) => data['@type'] === 'ItemList')
  expect(itemList?.itemListElement).toHaveLength(41)
  expect(itemList?.itemListElement?.some((item) => item.name === 'ChatGPT')).toBe(true)
})

test('filters by category with a shareable URL and without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('/tools')
    await page.getByRole('navigation', { name: 'Filter by category' }).getByRole('link', { name: /^Chat assistant/ }).click()
    await expect(page).toHaveURL(/\/tools\?category=chat-assistant$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chat assistant tools')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/tools\?category=chat-assistant$/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Chat assistant tools')
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', /\/tools\?category=chat-assistant$/)
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', 'Chat assistant tools')
    await expect(page.getByRole('link', { name: 'ChatGPT' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Claude' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cursor' })).toHaveCount(0)

    const payloads = await page.locator('script[type="application/ld+json"]').allTextContents()
    const itemList = payloads.map((payload) => JSON.parse(payload) as { '@type'?: string; itemListElement?: { name: string }[] }).find((data) => data['@type'] === 'ItemList')
    expect(itemList?.itemListElement?.map((item) => item.name)).toEqual(['ChatGPT', 'Claude', 'Gemini', 'Grok'])

    await page.goto('/tools?category=coding')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coding tools')
    await expect(page.getByRole('link', { name: 'Cursor' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'ChatGPT' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test('an unknown category does not echo the query', async ({ page }) => {
  await page.goto('/tools?category=not-a-real-category')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI tools')
  await expect(page.getByText('That category is not in the catalog.')).toBeVisible()
  await expect(page.getByText('not-a-real-category')).toHaveCount(0)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('the sitemap includes the tools index', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).toContain('/tools</loc>')
  expect(body).toContain('/tools/chatgpt</loc>')
})
