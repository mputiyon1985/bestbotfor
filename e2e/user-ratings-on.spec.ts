import { expect, test } from '@playwright/test'

/**
 * This project starts with USER_RATINGS=on and VERCEL_ENV=preview.
 * The proxy lets ratings paths through. The pages are not built yet, so a
 * 404 from the app not-found screen is the pass. /members/reviews falls
 * through to the sign-in redirect while Clerk is unset.
 */
const RATINGS_ROUTES = [
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

test('the proxy lets ratings paths through while the flag is on', async ({ request }) => {
  for (const path of RATINGS_ROUTES) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const type = response.headers()['content-type'] ?? ''
    expect(type, path).not.toContain('text/plain')
    const body = await response.text()
    expect(body, path).toContain('That page is not in the catalog.')
    expect(body, path).not.toBe('Not found.')
  }
})

test('member reviews fall through the ratings gate while the flag is on', async ({ request }) => {
  const response = await request.get('/members/reviews', { maxRedirects: 0 })
  const type = response.headers()['content-type'] ?? ''
  const body = await response.text()
  expect(body).not.toBe('Not found.')
  expect(type).not.toContain('text/plain')
  const status = response.status()
  if (status >= 300 && status < 400) {
    expect(response.headers()['location'] ?? '').toContain('/sign-in')
    return
  }
  expect(status).toBe(404)
  expect(body).toContain('That page is not in the catalog.')
})

test('the rest of the site still loads while the flag is on', async ({ request }) => {
  const home = await request.get('/')
  expect(home.status()).toBe(200)
  const tool = await request.get('/tools/chatgpt')
  expect(tool.status()).toBe(200)
})
