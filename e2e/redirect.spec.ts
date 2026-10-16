import { expect, test } from '@playwright/test'

test('devin desktop redirects permanently to windsurf', async ({ request }) => {
  const response = await request.get('/tools/devin-desktop', { maxRedirects: 0 })
  expect(response.status()).toBe(301)
  const location = response.headers().location ?? ''
  expect(new URL(location, 'http://127.0.0.1:3000').pathname).toBe('/tools/windsurf')

  const followed = await request.get('/tools/devin-desktop')
  expect(followed.status()).toBe(200)
  expect(await followed.text()).toContain('Devin Desktop (formerly Windsurf)')
})

test('the go route redirects only to the official tool URL', async ({ request }) => {
  const response = await request.get('/go/chatgpt?next=https://evil.example&ref=affiliate', { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers().location).toBe('https://chatgpt.com/')
})

test('an unknown tool is not redirected', async ({ request }) => {
  const response = await request.get('/go/not-a-real-tool', { maxRedirects: 0 })
  expect(response.status()).toBe(404)
  expect(await response.text()).toContain('not in the catalog')
})

test('go responses tell crawlers not to index or follow', async ({ request }) => {
  const redirect = await request.get('/go/chatgpt', { maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers()['x-robots-tag'] ?? '').toMatch(/noindex,\s*nofollow/)

  const missing = await request.get('/go/not-a-real-tool', { maxRedirects: 0 })
  expect(missing.status()).toBe(404)
  expect(missing.headers()['x-robots-tag'] ?? '').toMatch(/noindex,\s*nofollow/)
})
