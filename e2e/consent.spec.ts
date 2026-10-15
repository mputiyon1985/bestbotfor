import { expect, test, type Page, type Request } from '@playwright/test'

function isGoogleRequest(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  if (host.includes('googletagmanager')) return true
  if (host.includes('doubleclick')) return true
  if (host === 'gstatic.com' || host.endsWith('.gstatic.com')) return true
  return host.includes('google') && host.endsWith('.com')
}

function watchGoogle(page: Page): string[] {
  const seen: string[] = []
  const record = (request: Request) => {
    if (isGoogleRequest(request.url())) seen.push(request.url())
  }
  page.on('request', record)
  return seen
}

test('the first response does not reference Google analytics before consent', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).not.toContain('googletagmanager')
  expect(body).not.toContain('google-analytics')
  expect(body).not.toContain('doubleclick')
  expect(body).not.toContain('gtag/js')
})

test('analytics makes no Google request before consent and loads gtag only after Accept', async ({ page }) => {
  const seen = watchGoogle(page)
  await page.route('**/*', (route) => {
    if (isGoogleRequest(route.request().url())) return route.abort()
    return route.continue()
  })

  for (const path of ['/', '/best/coding', '/tools/cursor']) {
    await page.goto(path, { waitUntil: 'load' })
    await expect(page.getByRole('button', { name: 'Accept analytics' })).toBeVisible()
  }
  expect(seen, seen.join('\n')).toEqual([])

  const loaded = page.waitForRequest((request) => request.url().includes('googletagmanager.com/gtag/js'))
  await page.getByRole('button', { name: 'Accept analytics' }).click()
  const request = await loaded
  expect(isGoogleRequest(request.url())).toBe(true)
  expect(seen.length).toBeGreaterThan(0)
})

test('Reject does not send a Google analytics request', async ({ page }) => {
  const seen = watchGoogle(page)
  await page.route('**/*', (route) => {
    if (isGoogleRequest(route.request().url())) return route.abort()
    return route.continue()
  })
  await page.goto('/', { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Reject' }).click()
  await expect(page.getByRole('region', { name: 'Analytics cookies' })).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(seen).toEqual([])
})
