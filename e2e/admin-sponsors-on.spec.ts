import { expect, test } from '@playwright/test'

/**
 * This project starts with ADMIN_SPONSORS=on, USER_RATINGS blank, and VERCEL_ENV=test.
 * The sponsor queue and MFA setup pass the proxy. Ratings admin stays a plain 404.
 * Clerk is unset, so an admin page that gets through the flag 404s from the app.
 */
const OPEN = ['/admin/sponsors', '/Admin/Sponsors', '/admin/%73ponsors', '/admin/mfa-required', '/ADMIN/mfa-required']
const RATINGS = ['/admin', '/admin/reviews', '/admin/sponsor-links', '/review-guidelines']

test('the proxy lets the sponsor queue and MFA through while ratings stay hidden', async ({ request }) => {
  for (const path of OPEN) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
    const type = response.headers()['content-type'] ?? ''
    expect(type, path).not.toContain('text/plain')
    const body = await response.text()
    expect(body, path).toContain('That page is not in the catalog.')
    expect(body, path).not.toBe('Not found.')
    expect(response.headers()['cache-control'] ?? '', path).toContain('no-store')
    expect(response.headers()['x-robots-tag'] ?? '', path).toContain('noindex')
  }

  for (const path of RATINGS) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
    expect(response.headers()['content-type'] ?? '', path).toContain('text/plain')
    expect(await response.text(), path).toBe('Not found.')
  }

  const tool = await request.get('/tools/chatgpt')
  expect(tool.status()).toBe(200)
})
