import { expect, test } from '@playwright/test'

/**
 * Playwright starts with VERCEL_ENV=preview and USER_RATINGS blank, so the
 * ratings flag is off. Spec 9.4: no rating UI, and the review routes 404.
 * /members/reviews is covered by the existing members redirect, not here.
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
]

const HIDDEN_COPY = [
  'Rate this tool',
  'What users say',
  'How user ratings work',
  'Our rating',
  'No user ratings yet',
  'not enough ratings yet',
  'aggregateRating',
]

test('rating routes 404 while the flag is off', async ({ request }) => {
  for (const path of HIDDEN_ROUTES) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const body = await response.text()
    for (const phrase of ['Rate this tool', 'What users say', 'Your rating']) {
      expect(body, `${path} ${phrase}`).not.toContain(phrase)
    }
  }
})

test('the tool page keeps the editorial score and hides user ratings', async ({ page }) => {
  await page.goto('/tools/chatgpt')
  await expect(page.getByRole('heading', { level: 1, name: 'ChatGPT' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'BestBotFor score' })).toBeVisible()
  const body = await page.content()
  for (const phrase of HIDDEN_COPY) {
    expect(body, phrase).not.toContain(phrase)
  }
})
