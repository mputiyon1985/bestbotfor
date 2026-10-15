import { expect, test } from '@playwright/test'

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
