import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { isAdminPath } from '../src/lib/admin-path'
import { ATTESTATION, DISCLOSURE_ADVERTISER_PARAGRAPH, LAWYER_REVIEW_NOTICE, TRANSPARENCY_PLACEHOLDER } from '../src/lib/ratings-policy-copy'

/**
 * This project starts with USER_RATINGS=on and VERCEL_ENV=test.
 * npm start sets NODE_ENV=production, and an unset VERCEL_ENV would leave the flag off.
 * The proxy lets ratings paths through. Unbuilt ratings routes still 404 from
 * the app not-found screen. The two policy pages are the lawyer-review draft.
 * /members/reviews falls through to the sign-in redirect while Clerk is unset.
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
]

const BANNED = ['verified buyers', 'verified users of', 'all reviews', 'independent']

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

test('admin responses stay uncached and out of search while the flag is on', async ({ request }) => {
  for (const path of ['/admin', '/Admin', '/ADMIN/mfa-required', '/%41dmin', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/robots.txt']) {
    const response = await request.get(path)
    const body = await response.text()
    if (isAdminPath(path)) {
      expect(response.status(), path).toBe(404)
      expect(response.headers()['cache-control'] ?? '', path).toContain('no-store')
      expect(response.headers()['x-robots-tag'] ?? '', path).toContain('noindex')
      expect(body, path).toContain('That page is not in the catalog.')
      expect(body, path).not.toBe('Not found.')
    } else {
      expect(response.status(), path).toBe(200)
      expect(body, path).not.toContain('/admin')
    }
  }
})

test('the rest of the site still loads while the flag is on', async ({ request }) => {
  const home = await request.get('/')
  expect(home.status()).toBe(200)
  const tool = await request.get('/tools/chatgpt')
  expect(tool.status()).toBe(200)
})

test('the lawyer-review pages explain ratings without banned claims', async ({ page }) => {
  for (const path of ['/review-guidelines', '/how-user-ratings-work']) {
    await page.goto(path, { waitUntil: 'load' })
    const metas = page.locator('meta[name="robots"]')
    await expect(metas, path).toHaveCount(1)
    await expect(metas, path).toHaveAttribute('content', 'noindex, nofollow')
  }

  await page.goto('/review-guidelines')
  await expect(page.getByRole('heading', { level: 1, name: 'Review guidelines' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText(LAWYER_REVIEW_NOTICE)
  await expect(page.locator('p', { hasText: ATTESTATION })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'confidential_info' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'How user ratings work' })).toBeVisible()

  await page.goto('/how-user-ratings-work')
  await expect(page.getByRole('heading', { level: 1, name: 'How user ratings work' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText(LAWYER_REVIEW_NOTICE)
  await expect(page.getByText('The score is shown only when N is at least 5.', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1.5', exact: true })).toBeVisible()
  await expect(page.getByText(TRANSPARENCY_PLACEHOLDER, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review guidelines' })).toBeVisible()

  for (const path of ['/review-guidelines', '/how-user-ratings-work', '/privacy', '/terms', '/disclosure']) {
    await page.goto(path)
    const body = (await page.locator('main').innerText()).toLowerCase()
    for (const phrase of BANNED) {
      expect(body, `${path} ${phrase}`).not.toContain(phrase)
    }
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, path).toEqual([])
  }
})

test('privacy, terms, and disclosure include the ratings draft while the flag is on', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Ratings and reviews' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText(LAWYER_REVIEW_NOTICE)
  await expect(page.locator('p', { hasText: 'keyed hash of its network range, the IPv4 /24 or the IPv6 /48' })).toBeVisible()
  await expect(page.locator('p', { hasText: 'It was last updated on October 17, 2026. The ratings and reviews section below is draft copy pending lawyer review.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review guidelines' })).toHaveAttribute('href', '/review-guidelines')

  await page.goto('/terms')
  await expect(page.getByRole('note')).toContainText(LAWYER_REVIEW_NOTICE)
  await expect(page.locator('p', { hasText: 'Last updated October 17, 2026. The link to the review guidelines is draft copy pending lawyer review.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review guidelines' })).toHaveAttribute('href', '/review-guidelines')

  await page.goto('/disclosure')
  await expect(page.getByRole('note')).toContainText(LAWYER_REVIEW_NOTICE)
  await expect(page.locator('p', { hasText: DISCLOSURE_ADVERTISER_PARAGRAPH })).toBeVisible()
})
