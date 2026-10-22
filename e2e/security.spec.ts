import { request as httpRequest } from 'node:http'
import { expect, test } from '@playwright/test'
import { homeDescription, homeTitle, notFoundDescription, notFoundTitle } from '../src/lib/metadata'
import { CATALOG_TOOL_COUNT } from '../src/lib/seo-pages'
import { toolCategories } from '../src/lib/tool-index'
import { listedCatalogFromSeeds } from '../src/test/catalog-from-seeds'

function documentTitle(html: string): string {
  return html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
}

function metaContent(html: string, attr: 'name' | 'property', key: string): string {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0])
  const tag = tags.find((item) => new RegExp(`\\b${attr}=["']${key}["']`, 'i').test(item))
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? ''
}

function robotsDirectives(html: string): string[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /name=["']robots["']/i.test(match[0]))
    .map((match) => match[0].match(/content=["']([^"']*)["']/i)?.[1] ?? '')
}

function rawStatus(path: string): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000')
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: base.hostname, port: base.port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
}

test('the home page sends a nonce content security policy', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const policy = response.headers()['content-security-policy'] ?? ''
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain('nonce-')
  expect(policy).toContain("object-src 'none'")
})

const HOME_MARKER = 'The right AI in 30 seconds'

test('encoded dot segments do not render the home page', async () => {
  const home = await rawStatus('/')
  expect(home.status).toBe(200)
  expect(home.body).toContain(HOME_MARKER)
  // The same assertion used on 404s must fail when the body is the home page.
  expect(() => {
    expect(home.body).not.toContain(HOME_MARKER)
  }).toThrow()

  for (const path of [
    '/go/%2e%2e',
    '/go/%2E%2E',
    '/go/..',
    '/go/%2e%2e/',
    '/go/%252e%252e',
    '/go/foo/../../../',
    '/go/.%2e',
    '/go/%2e.',
    '/best/%2e%2e',
    '/tools/%2e%2e',
    '/compare/%2e%2e',
    '/about/%2e%2e',
    '/pricing/%2E%2E',
  ]) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
    expect(response.body, path).toContain('not a tool in the catalog')
    expect(response.body, path).not.toContain(HOME_MARKER)
    expect(documentTitle(response.body), path).not.toBe(homeTitle)
    expect(response.body, path).not.toContain(notFoundTitle)
  }
})

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name]
  return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

test('a malformed percent-escape is a clean 400 and a valid encoding still resolves', async () => {
  for (const path of ['/%E0%A4%A', '/admin/%E0%A4%A']) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(400)
    expect(response.body, path).toBe('Bad request.')
    expect(response.body, path).not.toContain('Internal Server Error')
    expect(headerValue(response.headers, 'cache-control'), path).toContain('no-store')
    expect(headerValue(response.headers, 'x-robots-tag'), path).toMatch(/noindex/i)
  }

  const tool = await rawStatus('/tools/chatgpt')
  const encodedTool = await rawStatus('/tools/%63hatgpt')
  const encodedMiddle = await rawStatus('/tools/chat%67pt')
  expect(tool.status).toBe(200)
  expect(encodedTool.status).toBe(200)
  expect(encodedMiddle.status).toBe(200)
  expect(encodedTool.body).not.toBe('Bad request.')
  expect(documentTitle(encodedTool.body)).toBe(documentTitle(tool.body))
  expect(documentTitle(encodedMiddle.body)).toBe(documentTitle(tool.body))

  const validUtf8 = await rawStatus('/%E0%A4%A1')
  expect(validUtf8.status).toBe(404)
  expect(validUtf8.body).not.toBe('Bad request.')
  expect(documentTitle(validUtf8.body)).toBe(notFoundTitle)

  const encodedRate = await rawStatus('/tools/chatgpt/%72ate')
  expect(encodedRate.status).toBe(404)
  expect(encodedRate.body).toBe('Not found.')
})

test('a 404 keeps exactly one noindex meta after hydration', async ({ page }) => {
  for (const path of ['/no-such-page', '/foo/bar/baz', '/tools/not-a-real-tool', '/compare/not-a-tool-vs-also-missing', '/best/not-a-real-task']) {
    await page.goto(path, { waitUntil: 'load' })
    const metas = page.locator('meta[name="robots"]')
    await expect(metas, path).toHaveCount(1)
    await expect(metas, path).toHaveAttribute('content', 'noindex')
  }
})

test('a real 404 from next start has exactly one noindex meta', async () => {
  // rawStatus buffers the whole response, including anything Next streams after the head.
  for (const path of ['/no-such-page', '/this-page-does-not-exist', '/tools/not-a-real-tool', '/compare/not-a-tool-vs-also-missing']) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
    expect(response.body, path).toContain('</html>')
    expect(robotsDirectives(response.body), path).toEqual(['noindex'])
  }
})

test('a missing page is the not-found screen, not the home page', async () => {
  const home = await rawStatus('/')
  expect(home.status).toBe(200)
  expect(documentTitle(home.body)).toBe(homeTitle)
  expect(home.body).not.toContain(notFoundTitle)
  // The footer repeats the tagline on both pages, so the document title is what separates them.
  expect(home.body).toContain(HOME_MARKER)
  expect(() => {
    expect(documentTitle(home.body)).toBe(notFoundTitle)
  }).toThrow()
  expect(() => {
    expect(documentTitle(home.body)).not.toBe(homeTitle)
  }).toThrow()

  const missing = await rawStatus('/this-page-does-not-exist')
  expect(missing.status).toBe(404)
  expect(documentTitle(missing.body)).toBe(notFoundTitle)
  expect(documentTitle(missing.body)).not.toBe(homeTitle)
  expect(missing.body).toContain('That page is not in the catalog.')
  expect(missing.body).toContain(HOME_MARKER)
  expect(robotsDirectives(missing.body)).toEqual(['noindex'])
  const missingTool = await rawStatus('/tools/not-a-real-tool')
  expect(missingTool.status).toBe(404)
  expect(robotsDirectives(missingTool.body)).toEqual(['noindex'])
  const missingCompare = await rawStatus('/compare/not-a-tool-vs-also-missing')
  expect(missingCompare.status).toBe(404)
  expect(robotsDirectives(missingCompare.body)).toEqual(['noindex'])
  expect(missing.body).not.toMatch(/<link rel="canonical"/)
  expect(metaContent(missing.body, 'property', 'og:url')).toBe('')
  expect(metaContent(missing.body, 'name', 'description')).toBe(notFoundDescription)
  expect(metaContent(missing.body, 'name', 'description')).not.toBe(homeDescription)
  expect(metaContent(missing.body, 'property', 'og:title')).toBe(notFoundTitle)
  expect(metaContent(missing.body, 'property', 'og:title')).not.toBe(homeTitle)
  expect(metaContent(missing.body, 'name', 'twitter:title')).toBe(notFoundTitle)
  expect(metaContent(missing.body, 'name', 'twitter:title')).not.toBe(homeTitle)
  expect(metaContent(missing.body, 'property', 'og:description')).toBe(notFoundDescription)
  expect(metaContent(missing.body, 'name', 'twitter:description')).toBe(notFoundDescription)
})

test('the tools index is served and still rejects an unsafe slug', async () => {
  const catalog = listedCatalogFromSeeds()
  const category = toolCategories(catalog.tools)[0]
  expect(category).toBeTruthy()
  if (!category) return

  const index = await rawStatus('/tools')
  expect(index.status).toBe(200)
  expect(index.body).toContain('Tools')
  expect(index.body).toContain(`${CATALOG_TOOL_COUNT} tools. Page 1 of`)
  expect(index.body).not.toContain('not a tool in the catalog')

  const filtered = await rawStatus(`/tools?category=${category.slug}`)
  expect(filtered.status).toBe(200)
  expect(filtered.body).toContain(`${category.count} ${category.name} tools. Page 1 of`)

  const unsafe = await rawStatus('/tools/%2e%2e')
  expect(unsafe.status).toBe(404)
  expect(unsafe.body).toContain('not a tool in the catalog')
})

test('a valid quiz result stays 200 and noindex', async () => {
  const response = await rawStatus('/result?task=chat&budget=any&skill=beginner')
  expect(response.status).toBe(200)
  expect(robotsDirectives(response.body)).toEqual(['noindex, nofollow'])
  const incomplete = await rawStatus('/result?task=chat&budget=any')
  expect(incomplete.status).toBe(200)
  expect(incomplete.body).toContain('We need three answers')
  expect(robotsDirectives(incomplete.body)).toEqual(['noindex, nofollow'])
})

test('a result 404 has one robots meta', async () => {
  for (const path of [
    '/result?task=marketing&budget=any&skill=beginner',
    '/result?task=chat&budget=mid&skill=beginner',
    '/result?task=chat&budget=nope',
    '/result?task=Not_A_Task&budget=any&skill=beginner',
    '/result?task=chat&view=other',
    '/result?task=missing&view=all',
    '/result?task=chat&view=all&page=99',
    '/result?task=chat&view=all&budget=mid',
  ]) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
    expect(documentTitle(response.body), path).toBe(notFoundTitle)
    expect(response.body, path).toContain(notFoundDescription)
    expect(robotsDirectives(response.body), path).toEqual(['noindex, nofollow'])
    expect(response.body, path).not.toMatch(/<link rel="canonical"/)
  }
})

test('a failed result lookup 404s a missing task with one robots meta', async ({ request }) => {
  test.setTimeout(30_000)
  const missing = '/result?task=marketing&budget=any&skill=beginner'
  for (const fault of ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow']) {
    const response = await request.get(missing, { headers: { 'x-bbf-result-fault': fault } })
    const body = await response.text()
    expect(response.status(), fault).toBe(404)
    expect(documentTitle(body), fault).toBe(notFoundTitle)
    expect(body, fault).toContain('Page not found')
    expect(robotsDirectives(body), fault).toEqual(['noindex, nofollow'])
  }

  const quiz = '/result?task=chat&budget=any&skill=beginner'
  for (const fault of ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow']) {
    const response = await request.get(quiz, { headers: { 'x-bbf-result-fault': fault } })
    const body = await response.text()
    expect(response.status(), fault).toBe(200)
    expect(documentTitle(body), fault).not.toBe(notFoundTitle)
    expect(body, fault).toContain('Your pick')
    expect(robotsDirectives(body), fault).toEqual(['noindex, nofollow'])
  }
})

test('a result catalog that is still down answers 503, not 500', async ({ request }) => {
  for (const path of ['/result?task=marketing&budget=any&skill=beginner', '/result?task=chat&budget=any&skill=beginner']) {
    const response = await request.get(path, { headers: { 'x-bbf-result-fault': 'db-down' } })
    const body = await response.text()
    expect(response.status(), path).toBe(503)
    expect(response.headers()['retry-after'], path).toBe('30')
    expect(body, path).toContain('Results are unavailable')
    expect(body, path).not.toContain('Application error')
    expect(robotsDirectives(body), path).toEqual(['noindex, nofollow'])
  }
})

test('a tripped quiz rate limit returns 429 with Retry-After', async ({ request }) => {
  test.setTimeout(120_000)
  const headers = { 'x-forwarded-for': `2001:db8::${Date.now().toString(16)}` }
  const path = '/result?task=chat&budget=any&skill=beginner'
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(path, { headers })
    expect(response.status(), `attempt ${attempt + 1}`).toBe(200)
  }
  const blocked = await request.get(path, { headers })
  expect(blocked.status()).toBe(429)
  const retryAfter = Number(blocked.headers()['retry-after'])
  expect(Number.isInteger(retryAfter)).toBe(true)
  expect(retryAfter).toBeGreaterThan(0)
  const body = await blocked.text()
  expect(body).toContain('Too many results')
  expect(robotsDirectives(body)).toEqual(['noindex, nofollow'])
  const matches = await request.get('/result?task=chat&view=all', { headers })
  expect(matches.status()).toBe(200)
})

test('best and tools reject a slug that is not in the catalog shape', async () => {
  for (const path of ['/best/%2e%2e', '/tools/%2e%2e', '/best/Not_A_Task']) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
  }
})

test('a compare image uses the pair and is cacheable', async ({ request }) => {
  const response = await request.get('/api/og?kind=compare&pair=chatgpt-vs-claude')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(response.headers()['content-type']).not.toContain('text/html')
  const cache = response.headers()['cache-control'] ?? ''
  expect(cache).toContain('s-maxage=86400')
  expect(cache).toContain('stale-while-revalidate=604800')
})

test('invalid preview params redirect to one canonical url', async ({ request }) => {
  const response = await request.get('/api/og?title=%3Cscript%3E&kind=nope', { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toBe('/api/og')
  expect(response.headers()['cache-control'] ?? '').toContain('s-maxage=86400')

  const reordered = await request.get('/api/og?pair=chatgpt-vs-claude&kind=compare', { maxRedirects: 0 })
  expect(reordered.status()).toBe(308)
  expect(reordered.headers().location).toBe('/api/og?kind=compare&pair=chatgpt-vs-claude')
})
