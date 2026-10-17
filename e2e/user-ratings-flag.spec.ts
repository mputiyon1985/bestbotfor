import { expect, test } from '@playwright/test'

/**
 * Playwright starts with VERCEL_ENV=preview and USER_RATINGS blank, so the
 * ratings flag is off. The proxy answers these paths with a plain-text 404
 * before the members sign-in redirect.
 */
const HIDDEN_ROUTES = [
  '/tools/chatgpt/rate',
  '/admin',
  '/admin/reviews',
  '/admin/reports',
  '/admin/audit',
  '/admin/vendor-domains',
  '/admin/sponsor-links',
  '/api/tools/chatgpt/reviews',
  '/review-guidelines',
  '/how-user-ratings-work',
  '/members/reviews',
]

const HIDDEN_COPY = [
  'Rate this tool',
  'What users say',
  'How user ratings work',
  'No user ratings yet',
  'not enough ratings yet',
  'aggregateRating',
]

test('rating routes 404 while the flag is off', async ({ request }) => {
  for (const path of HIDDEN_ROUTES) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
    expect(response.headers()['content-type'] ?? '', path).toContain('text/plain')
    const body = await response.text()
    expect(body, path).toBe('Not found.')
    expect(body, path).not.toContain('That page is not in the catalog.')
    for (const phrase of ['Rate this tool', 'What users say', 'Your rating']) {
      expect(body, `${path} ${phrase}`).not.toContain(phrase)
    }
  }
})

test('the tool page keeps the editorial score and hides user ratings', async ({ page }) => {
  await page.goto('/tools/chatgpt')
  await expect(page.getByRole('heading', { level: 1, name: 'ChatGPT' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Our rating', exact: true })).toBeVisible()
  const body = await page.content()
  for (const phrase of HIDDEN_COPY) {
    expect(body, phrase).not.toContain(phrase)
  }
})
