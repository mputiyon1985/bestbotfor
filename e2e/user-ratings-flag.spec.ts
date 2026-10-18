import { expect, test } from '@playwright/test'

/**
 * Playwright starts with VERCEL_ENV=test and USER_RATINGS blank, so the
 * ratings flag is off. The proxy answers these paths with a plain-text 404
 * before the members sign-in redirect. Case and percent-encoding are the same gate.
 * The editorial heading is "Our rating" after #34.
 */
const HIDDEN_ROUTES = [
  '/tools/chatgpt/rate',
  '/Tools/ChatGPT/Rate',
  '/tools/chatgpt/%72ate',
  '/Admin/Reviews',
  '/admin',
  '/admin/reviews',
  '/admin/reports',
  '/admin/audit',
  '/admin/vendor-domains',
  '/admin/sponsor-links',
  '/admin/mfa-required',
  '/admin/sponsors',
  '/Admin/Sponsors',
  '/admin/%73ponsors',
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

test('privacy, terms, and disclosure omit the ratings draft while the flag is off', async ({ request }) => {
  const hidden = [
    'Pending lawyer review',
    'Ratings and reviews',
    'network range',
    'How user ratings work',
    'Review guidelines',
  ]
  for (const path of ['/privacy', '/terms', '/disclosure']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    const body = await response.text()
    for (const phrase of hidden) {
      expect(body, `${path} ${phrase}`).not.toContain(phrase)
    }
  }
  const privacy = await (await request.get('/privacy')).text()
  expect(privacy).toContain('It was last updated on October 18, 2026.')
  expect(privacy).not.toContain('ratings and reviews section')
  const terms = await (await request.get('/terms')).text()
  expect(terms).toContain('Last updated October 15, 2026.')
  expect(terms).not.toContain('October 17, 2026')
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
